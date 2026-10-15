import { cloneElement, isValidElement, type ReactElement } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useHqCatalogBranchContext } from '@/hooks/useHqCatalogBranchEdit.ts';

type Props = {
  /** The existing Add / Import button element from the list page. */
  children: ReactElement;
};

/**
 * Gates create/import while HQ Editing for branches.
 * Allowed on Base catalog or exactly one branch (Phase 6 branch-owned create).
 * Locked when two or more branches are selected (override-only).
 */
export function HqCatalogBaseOnlyAction({ children }: Props) {
  const { t } = useTranslation(['admin']);
  const { canCreateEntities, isBranchEditMode, soleBranchId } =
    useHqCatalogBranchContext();

  if (!isValidElement(children)) return children;
  if (canCreateEntities) return children;

  const child = children as ReactElement<any>;
  const message =
    isBranchEditMode && !soleBranchId
      ? t('admin:hqBranchEdit.createMultiBlocked')
      : t('admin:hqBranchEdit.createBlocked');

  return cloneElement(child, {
    disabled: true,
    title: message,
    onClick: (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      toast.error(message);
    },
  });
}
