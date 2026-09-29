import { useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { useDB } from '@/api/db/db.ts';
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx';
import { listSyncBranches } from '@/lib/catalog-publish.ts';
import { hqCatalogEditBranchIdsAtom } from '@/store/jotai.ts';

type Option = { label: string; value: string };

/**
 * Compact Admin toolbar slot: Base catalog (empty) or one/many sync_branch
 * targets for sparse override edits. Instructions live in a popover so the
 * rest of the bottom toolbar stays free for sync / printers / time.
 */
export function HqCatalogBranchToolbarSlot() {
  const { t } = useTranslation('admin');
  const db = useDB();
  const [branchIds, setBranchIds] = useAtom(hqCatalogEditBranchIdsAtom);
  const [branchOptions, setBranchOptions] = useState<Option[]>([]);
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const branches = await listSyncBranches(db);
        if (cancelled) return;
        setBranchOptions(
          branches
            .filter((b) => b.active !== false)
            .map((b) => ({
              value: b.client_id,
              label: `${b.name} (${b.client_id})`,
            }))
        );
      } catch {
        // Branches table may be missing until migration; keep Base only.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- never put db in hook deps
  }, [t]);

  const selected = useMemo(
    () => branchOptions.filter((o) => branchIds.includes(o.value)),
    [branchOptions, branchIds]
  );

  const branchLabel =
    selected.length === 0
      ? t('hqBranchEdit.baseCatalog')
      : selected.length === 1
        ? selected[0].label
        : t('hqBranchEdit.branchesCount', { count: selected.length });

  return (
    <div
      className="relative flex min-w-0 max-w-[min(100%,35rem)] flex-1 items-center gap-2"
      data-testid="hq-catalog-branch-banner"
    >
      <span className="shrink-0 text-xs font-medium text-muted whitespace-nowrap">
        {t('hqBranchEdit.bannerTitle')}
      </span>
      <div className="min-w-0 flex-1">
        <ReactSelect
          options={branchOptions}
          value={selected}
          isMulti
          isClearable
          menuPlacement="top"
          placeholder={t('hqBranchEdit.baseCatalog')}
          onChange={(opts: any) => {
            const list = Array.isArray(opts) ? opts : opts ? [opts] : [];
            setBranchIds(
              list
                .map((o: Option) => String(o?.value || ''))
                .filter(Boolean)
            );
          }}
          data-testid="hq-catalog-branch-select"
        />
      </div>
      <button
        type="button"
        className="shrink-0 flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-surface hover:text-foreground"
        aria-label={t('hqBranchEdit.helpAria')}
        title={t('hqBranchEdit.helpAria')}
        data-testid="hq-catalog-branch-help"
        onClick={() => setHintOpen((v) => !v)}
      >
        <FontAwesomeIcon icon={faCircleInfo} className="text-sm" />
      </button>
      {hintOpen && (
        <div
          className="absolute bottom-full left-0 mb-2 w-[min(100vw-2rem,22rem)] rounded-lg border border-border bg-surface-elevated p-3 text-xs text-foreground shadow-lg z-10"
          data-testid="hq-catalog-branch-hint"
          role="dialog"
        >
          <p className="font-medium mb-1">{branchLabel}</p>
          <p className="text-muted">
            {branchIds.length > 0
              ? t('hqBranchEdit.branchHint', { branch: branchLabel })
              : t('hqBranchEdit.baseHint')}
          </p>
          {branchIds.length > 0 && (
            <p className="text-warning mt-2">{t('hqBranchEdit.createLockedHint')}</p>
          )}
          <button
            type="button"
            className="mt-2 text-primary hover:underline"
            onClick={() => setHintOpen(false)}
          >
            {t('hqBranchEdit.dismissHint')}
          </button>
        </div>
      )}
    </div>
  );
}

/** @deprecated use HqCatalogBranchToolbarSlot */
export const HqCatalogBranchBanner = HqCatalogBranchToolbarSlot;
