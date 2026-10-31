import {useRef, useState} from "react";
import {useAtom, useSetAtom} from "jotai";
import {toast} from "sonner";
import {useTranslation} from "react-i18next";
import {useDB} from "@/api/db/db.ts";
import {useDatabase} from "@/hooks/useDatabase.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getUserModules, moduleMatchCandidates} from "@/lib/access.rules.ts";
import {appPage, appSettings, appState} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {
  BackupHttpError,
  downloadDatabaseBackup,
  uploadDatabaseBackup,
} from "@/lib/backup.service.ts";
import {
  buildAppPagePrefsPatch,
  buildAppStatePrefsPatch,
  buildSettingsBackupFile,
  downloadSettingsBackupJson,
  fetchAllSettingRows,
  parseSettingsBackupFile,
  restoreSettingRows,
  type SettingsBackupFile,
} from "@/lib/settings-backup.ts";
import {terminalSyncService} from "@/infrastructure/sync/sync-service.ts";
import {refreshCatalogIntoSettings} from "@/providers/pos-store.provider.tsx";

type BusyKind = "settings-export" | "settings-restore" | "db-export" | "db-restore" | null;

export const BackupRestoreSettings = () => {
  const {t} = useTranslation("settings");
  const db = useDB();
  const {isEffectivelyConnected} = useDatabase();
  const {protectAction} = useSecurity();
  const [page, setPage] = useAtom(appPage);
  const [state, setState] = useAtom(appState);
  const setSettings = useSetAtom(appSettings);

  const [busy, setBusy] = useState<BusyKind>(null);
  const [settingsRestoreOpen, setSettingsRestoreOpen] = useState(false);
  const [dbRestoreOpen, setDbRestoreOpen] = useState(false);
  const [pendingSettingsFile, setPendingSettingsFile] = useState<SettingsBackupFile | null>(null);
  const [pendingDbFile, setPendingDbFile] = useState<File | null>(null);

  const settingsFileRef = useRef<HTMLInputElement>(null);
  const dbFileRef = useRef<HTMLInputElement>(null);

  const modules = getUserModules(page.user);
  const canDatabase = moduleMatchCandidates("settings.database").some((c) =>
    modules.includes(c),
  );

  const canAct = busy === null;

  const exportSettings = () => {
    protectAction(async () => {
      if (!isEffectivelyConnected) {
        toast.error(t("backup.offline"));
        return;
      }
      setBusy("settings-export");
      try {
        const rows = await fetchAllSettingRows(db);
        const file = buildSettingsBackupFile({
          settings: rows,
          page,
          state,
        });
        downloadSettingsBackupJson(file);
        toast.success(t("backup.settings.exported"));
      } catch (err) {
        console.error(err);
        toast.error(t("backup.settings.exportFailed"));
      } finally {
        setBusy(null);
      }
    }, {
      module: "settings.backup",
      description: t("backup.settings.exportDescription"),
    });
  };

  const onSettingsFileChosen = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseSettingsBackupFile(JSON.parse(text));
      setPendingSettingsFile(parsed);
      setSettingsRestoreOpen(true);
    } catch (err) {
      console.error(err);
      toast.error(t("backup.settings.invalidFile"));
    } finally {
      if (settingsFileRef.current) settingsFileRef.current.value = "";
    }
  };

  const confirmSettingsRestore = async () => {
    if (!pendingSettingsFile) return;
    if (!isEffectivelyConnected) {
      toast.error(t("backup.offline"));
      return;
    }

    await new Promise<void>((resolve) => {
      protectAction(async () => {
        setBusy("settings-restore");
        try {
          await restoreSettingRows(db, pendingSettingsFile.settings);
          const pagePatch = buildAppPagePrefsPatch(pendingSettingsFile.devicePrefs);
          const statePatch = buildAppStatePrefsPatch(pendingSettingsFile.devicePrefs);
          if (Object.keys(pagePatch).length) {
            setPage((prev) => ({...prev, ...pagePatch}));
          }
          if (Object.keys(statePatch).length) {
            setState((prev) => ({...prev, ...statePatch}));
          }
          toast.success(t("backup.settings.restored"));
        } catch (err) {
          console.error(err);
          toast.error(t("backup.settings.restoreFailed"));
        } finally {
          setBusy(null);
          setPendingSettingsFile(null);
          resolve();
        }
      }, {
        module: "settings.restore",
        description: t("backup.settings.restoreDescription"),
        onCancel: () => {
          setPendingSettingsFile(null);
          resolve();
        },
      });
    });
  };

  const exportDatabase = () => {
    protectAction(async () => {
      if (!isEffectivelyConnected) {
        toast.error(t("backup.offline"));
        return;
      }
      setBusy("db-export");
      try {
        await downloadDatabaseBackup();
        toast.success(t("backup.database.exported"));
      } catch (err) {
        console.error(err);
        const status = err instanceof BackupHttpError ? err.status : 0;
        toast.error(
          status === 403
            ? t("backup.database.forbidden")
            : t("backup.database.exportFailed"),
        );
      } finally {
        setBusy(null);
      }
    }, {
      module: "settings.database",
      description: t("backup.database.exportDescription"),
    });
  };

  const onDbFileChosen = (file: File | null) => {
    if (!file) return;
    setPendingDbFile(file);
    setDbRestoreOpen(true);
    if (dbFileRef.current) dbFileRef.current.value = "";
  };

  const confirmDbRestore = async () => {
    if (!pendingDbFile) return;
    if (!isEffectivelyConnected) {
      toast.error(t("backup.offline"));
      return;
    }

    await new Promise<void>((resolve) => {
      protectAction(async () => {
        setBusy("db-restore");
        try {
          await uploadDatabaseBackup(pendingDbFile);
          try {
            await terminalSyncService.rehydrateCatalogFromServer();
            await refreshCatalogIntoSettings(setSettings);
          } catch (rehydrateErr) {
            console.warn("Catalog rehydrate after database restore failed", rehydrateErr);
          }
          toast.success(t("backup.database.restored"));
        } catch (err) {
          console.error(err);
          const status = err instanceof BackupHttpError ? err.status : 0;
          toast.error(
            status === 403
              ? t("backup.database.forbidden")
              : t("backup.database.restoreFailed"),
          );
        } finally {
          setBusy(null);
          setPendingDbFile(null);
          resolve();
        }
      }, {
        module: "settings.database",
        description: t("backup.database.restoreDescription"),
        onCancel: () => {
          setPendingDbFile(null);
          resolve();
        },
      });
    });
  };

  return (
    <div
      className="shadow p-5 rounded-xl bg-surface-elevated"
      data-testid="settings-card-backup-restore"
    >
      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t("backup.title")}</h2>
          <p className="text-sm text-muted">{t("backup.description")}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section data-testid="backup-section-settings" className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
          <h3 className="text-lg font-semibold mb-1">{t("backup.settings.title")}</h3>
          <p className="text-sm text-muted mb-4">{t("backup.settings.description")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="lg"
              disabled={!canAct || !isEffectivelyConnected}
              isLoading={busy === "settings-export"}
              onClick={exportSettings}
            >
              {t("backup.settings.export")}
            </Button>
            <Button
              variant="danger"
              size="lg"
              disabled={!canAct || !isEffectivelyConnected}
              isLoading={busy === "settings-restore"}
              onClick={() => settingsFileRef.current?.click()}
            >
              {t("backup.settings.restore")}
            </Button>
            <input
              ref={settingsFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void onSettingsFileChosen(e.target.files?.[0] ?? null)}
            />
          </div>
          {!isEffectivelyConnected && (
            <p className="text-sm text-warning mt-3">{t("backup.offlineHint")}</p>
          )}
        </section>

        {canDatabase && (
          <section data-testid="backup-section-database" className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
            <h3 className="text-lg font-semibold mb-1">{t("backup.database.title")}</h3>
            <p className="text-sm text-muted mb-4">{t("backup.database.description")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="lg"
                disabled={!canAct || !isEffectivelyConnected}
                isLoading={busy === "db-export"}
                onClick={exportDatabase}
              >
                {t("backup.database.export")}
              </Button>
              <Button
                variant="danger"
                size="lg"
                disabled={!canAct || !isEffectivelyConnected}
                isLoading={busy === "db-restore"}
                onClick={() => dbFileRef.current?.click()}
              >
                {t("backup.database.restore")}
              </Button>
              <input
                ref={dbFileRef}
                type="file"
                accept=".surql,application/octet-stream,text/plain"
                className="hidden"
                onChange={(e) => onDbFileChosen(e.target.files?.[0] ?? null)}
              />
            </div>
            {!isEffectivelyConnected && (
              <p className="text-sm text-warning mt-3">{t("backup.offlineHint")}</p>
            )}
          </section>
        )}
      </div>

      <DeleteConfirm
        open={settingsRestoreOpen}
        onOpenChange={(open) => {
          setSettingsRestoreOpen(open);
          if (!open) setPendingSettingsFile(null);
        }}
        title={t("backup.settings.confirmTitle")}
        message={t("backup.settings.confirmMessage")}
        onConfirm={() => void confirmSettingsRestore()}
      />

      <DeleteConfirm
        open={dbRestoreOpen}
        onOpenChange={(open) => {
          setDbRestoreOpen(open);
          if (!open) setPendingDbFile(null);
        }}
        title={t("backup.database.confirmTitle")}
        message={t("backup.database.confirmMessage")}
        onConfirm={() => void confirmDbRestore()}
      />
    </div>
  );
};
