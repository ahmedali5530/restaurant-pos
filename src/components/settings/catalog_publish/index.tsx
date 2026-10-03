import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAtom } from 'jotai';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faPencil } from '@fortawesome/free-solid-svg-icons';
import { useDB } from '@/api/db/db.ts';
import { Button } from '@/components/common/input/button.tsx';
import { Input } from '@/components/common/input/input.tsx';
import { Checkbox } from '@/components/common/input/checkbox.tsx';
import { Radio } from '@/components/common/input/radio.tsx';
import { Switch } from '@/components/common/input/switch.tsx';
import { DeleteConfirm } from '@/components/common/table/delete.confirm.tsx';
import { useSecurity } from '@/hooks/useSecurity.ts';
import { CATALOG_DOWNLOAD_TABLES } from '@/lib/catalog-sync-tables.ts';
import {
  listRecentCatalogReleases,
  listSyncBranches,
  publishCatalogRelease,
  upsertSyncBranch,
  type CatalogRelease,
  type PublishAudience,
  type SyncBranch,
} from '@/lib/catalog-publish.ts';
import { formatDateTime } from '@/lib/datetime.ts';
import { getUserModules, moduleMatchCandidates } from '@/lib/access.rules.ts';
import { appPage } from '@/store/jotai.ts';

const MODULE = 'admin.catalog_publish';

export function CatalogPublishPanel() {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const db = useDB();
  const { protectAction } = useSecurity();
  const [page] = useAtom(appPage);
  const modules = getUserModules(page.user);
  const hasAccess = moduleMatchCandidates(MODULE).some((c) => modules.includes(c));

  const [branches, setBranches] = useState<SyncBranch[]>([]);
  const [releases, setReleases] = useState<CatalogRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBranch, setSavingBranch] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [branchClientId, setBranchClientId] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchActive, setBranchActive] = useState(true);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  const [audience, setAudience] = useState<PublishAudience>('all');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([...CATALOG_DOWNLOAD_TABLES]);
  const [note, setNote] = useState('');

  const activeBranches = useMemo(
    () => branches.filter((b) => b.active !== false),
    [branches]
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const [branchRows, releaseRows] = await Promise.all([
        listSyncBranches(db),
        listRecentCatalogReleases(db),
      ]);
      setBranches(branchRows);
      setReleases(releaseRows);
    } catch (e: any) {
      toast.error(e?.message || t('admin:catalogPublish.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasAccess) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- never put db in hook deps
  }, [hasAccess]);

  const resetBranchForm = () => {
    setBranchClientId('');
    setBranchName('');
    setBranchActive(true);
    setEditingClientId(null);
  };

  const startEditBranch = (branch: SyncBranch) => {
    setEditingClientId(branch.client_id);
    setBranchClientId(branch.client_id);
    setBranchName(branch.name);
    setBranchActive(branch.active !== false);
  };

  const saveBranch = () => {
    protectAction(
      async () => {
        setSavingBranch(true);
        try {
          await upsertSyncBranch(db, {
            client_id: branchClientId,
            name: branchName,
            active: branchActive,
          });
          toast.success(t('admin:catalogPublish.branchSaved'));
          resetBranchForm();
          await refresh();
        } catch (e: any) {
          toast.error(e?.message || t('admin:catalogPublish.branchSaveError'));
        } finally {
          setSavingBranch(false);
        }
      },
      {
        module: MODULE,
        description: t('admin:catalogPublish.accessSaveBranch'),
      }
    );
  };

  const toggleBranchId = (clientId: string, checked: boolean) => {
    setSelectedBranchIds((prev) =>
      checked ? [...new Set([...prev, clientId])] : prev.filter((id) => id !== clientId)
    );
  };

  const toggleTable = (table: string, checked: boolean) => {
    setSelectedTables((prev) =>
      checked ? [...new Set([...prev, table])] : prev.filter((name) => name !== table)
    );
  };

  const selectAllTables = () => setSelectedTables([...CATALOG_DOWNLOAD_TABLES]);
  const clearTables = () => setSelectedTables([]);

  const doPublish = async () => {
    setPublishing(true);
    try {
      const publishedBy = page.user
        ? [page.user.first_name, page.user.last_name].filter(Boolean).join(' ') ||
          page.user.login ||
          String(page.user.id)
        : null;
      const result = await publishCatalogRelease(db, {
        audience,
        branchIds: selectedBranchIds,
        tables: selectedTables,
        note,
        publishedBy,
      });
      toast.success(
        t('admin:catalogPublish.publishSuccess', {
          version: result.version,
          targets: result.targets.join(', '),
        })
      );
      setNote('');
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || t('admin:catalogPublish.publishError'));
    } finally {
      setPublishing(false);
      setConfirmOpen(false);
    }
  };

  const requestPublish = () => {
    if (!selectedTables.length) {
      toast.error(t('admin:catalogPublish.tablesRequired'));
      return;
    }
    if (audience === 'branches' && !selectedBranchIds.length) {
      toast.error(t('admin:catalogPublish.branchesRequired'));
      return;
    }
    protectAction(
      () => setConfirmOpen(true),
      {
        module: MODULE,
        description: t('admin:catalogPublish.accessPublish'),
      }
    );
  };

  if (!hasAccess) {
    return (
      <div className="p-6 text-center text-muted" data-testid="catalog-publish-no-access">
        {t('admin:catalogPublish.noAccess')}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-muted" data-testid="catalog-publish-loading">
        {t('admin:catalogPublish.loading')}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-8" data-testid="catalog-publish-panel">
      <section className="space-y-3" data-testid="catalog-publish-branches">
        <h2 className="text-lg font-semibold text-foreground">{t('admin:catalogPublish.branchesTitle')}</h2>
        <p className="text-sm text-muted">{t('admin:catalogPublish.branchesHelp')}</p>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Input
              label={t('admin:catalogPublish.clientId')}
              value={branchClientId}
              onChange={(e) => setBranchClientId(e.target.value)}
              disabled={!!editingClientId || savingBranch}
              placeholder="store-north"
            />
          </div>
          <div>
            <Input
              label={t('admin:catalogPublish.branchName')}
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              disabled={savingBranch}
            />
          </div>
          <div className="flex items-end gap-3 pb-1">
            <div>
              <Switch
                checked={branchActive}
                onChange={(e) => setBranchActive((e.target as HTMLInputElement).checked)}
                disabled={savingBranch}
              >
                {t('admin:catalogPublish.active')}
              </Switch>
            </div>
            <Button
              variant="primary"
              onClick={saveBranch}
              disabled={savingBranch || !branchClientId.trim()}
              isLoading={savingBranch}
            >
              <FontAwesomeIcon icon={editingClientId ? faPencil : faPlus} className="mr-2" />
              {editingClientId
                ? t('admin:catalogPublish.updateBranch')
                : t('admin:catalogPublish.addBranch')}
            </Button>
            {editingClientId && (
              <Button flat onClick={resetBranchForm} disabled={savingBranch}>
                {t('common:actions.cancel')}
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border border-border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-surface dark:bg-neutral-800 text-left text-foreground">
              <tr>
                <th className="px-3 py-2">{t('admin:catalogPublish.clientId')}</th>
                <th className="px-3 py-2">{t('admin:catalogPublish.branchName')}</th>
                <th className="px-3 py-2">{t('admin:catalogPublish.active')}</th>
                <th className="px-3 py-2">{t('admin:columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {branches.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-muted">
                    {t('admin:catalogPublish.noBranches')}
                  </td>
                </tr>
              )}
              {branches.map((branch) => (
                <tr key={branch.client_id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{branch.client_id}</td>
                  <td className="px-3 py-2">{branch.name}</td>
                  <td className="px-3 py-2">
                    {branch.active !== false
                      ? t('admin:catalogPublish.yes')
                      : t('admin:catalogPublish.no')}
                  </td>
                  <td className="px-3 py-2">
                    <Button flat size="sm" onClick={() => startEditBranch(branch)}>
                      <FontAwesomeIcon icon={faPencil} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" data-testid="catalog-publish-form">
        <h2 className="text-lg font-semibold text-foreground">{t('admin:catalogPublish.publishTitle')}</h2>
        <p className="text-sm text-muted">{t('admin:catalogPublish.publishHelp')}</p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('admin:catalogPublish.audience')}</legend>
          <div className="flex items-top gap-3">
            <div className="inline-flex items-center gap-3">
              <Radio
                name="catalog-audience"
                checked={audience === 'all'}
                onChange={() => setAudience('all')}
              />
              <span className="text-sm font-medium text-foreground">
                {t('admin:catalogPublish.audienceAll')}
              </span>
            </div>
            <div className="inline-flex items-center gap-3">
              <Radio
                name="catalog-audience"
                checked={audience === 'branches'}
                onChange={() => setAudience('branches')}
              />
              <span className="text-sm font-medium text-foreground">
                {t('admin:catalogPublish.audienceSelected')}
              </span>
            </div>
          </div>
        </fieldset>

        {audience === 'branches' && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeBranches.length === 0 && (
              <p className="text-sm text-muted col-span-full">{t('admin:catalogPublish.noActiveBranches')}</p>
            )}
            {activeBranches.map((branch) => (
              <div key={branch.client_id}>
                <Checkbox
                  checked={selectedBranchIds.includes(branch.client_id)}
                  onChange={(e) => toggleBranchId(branch.client_id, (e.target as HTMLInputElement).checked)}
                  label={`${branch.name} (${branch.client_id})`}
                />
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{t('admin:catalogPublish.tables')}</span>
            <Button flat size="sm" onClick={selectAllTables}>
              {t('admin:catalogPublish.selectAll')}
            </Button>
            <Button flat size="sm" onClick={clearTables}>
              {t('admin:catalogPublish.clearAll')}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {CATALOG_DOWNLOAD_TABLES.map((table) => (
              <div key={table}>
                <Checkbox
                  checked={selectedTables.includes(table)}
                  onChange={(e) => toggleTable(table, (e.target as HTMLInputElement).checked)}
                  label={table}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-xl">
          <Input
            label={t('admin:catalogPublish.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin:catalogPublish.notePlaceholder')}
          />
        </div>

        <Button
          variant="primary"
          onClick={requestPublish}
          disabled={publishing}
          isLoading={publishing}
          data-testid="catalog-publish-submit"
        >
          {t('admin:catalogPublish.publish')}
        </Button>

        <DeleteConfirm
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('admin:catalogPublish.confirmTitle')}
          message={t('admin:catalogPublish.confirmMessage', {
            audience:
              audience === 'all'
                ? t('admin:catalogPublish.audienceAll')
                : selectedBranchIds.join(', '),
            tables: selectedTables.length,
          })}
          onConfirm={doPublish}
        />
      </section>

      <section className="space-y-3" data-testid="catalog-publish-history">
        <h2 className="text-lg font-semibold text-foreground">{t('admin:catalogPublish.historyTitle')}</h2>
        <div className="overflow-x-auto border border-border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-surface dark:bg-neutral-800 text-left text-foreground">
              <tr>
                <th className="px-3 py-2">{t('admin:catalogPublish.version')}</th>
                <th className="px-3 py-2">{t('admin:catalogPublish.releaseId')}</th>
                <th className="px-3 py-2">{t('admin:catalogPublish.publishedAt')}</th>
                <th className="px-3 py-2">{t('admin:catalogPublish.audience')}</th>
                <th className="px-3 py-2">{t('admin:catalogPublish.note')}</th>
              </tr>
            </thead>
            <tbody>
              {releases.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-muted">
                    {t('admin:catalogPublish.noReleases')}
                  </td>
                </tr>
              )}
              {releases.map((release) => (
                <tr key={release.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono">{release.version ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{release.id}</td>
                  <td className="px-3 py-2">
                    {release.published_at
                      ? formatDateTime(release.published_at)
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {release.audience === 'branches'
                      ? (release.branch_ids || []).join(', ') || t('admin:catalogPublish.audienceSelected')
                      : t('admin:catalogPublish.audienceAll')}
                  </td>
                  <td className="px-3 py-2">{release.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
