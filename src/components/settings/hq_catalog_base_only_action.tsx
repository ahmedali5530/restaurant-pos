import { cloneElement, isValidElement, type ReactElement } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useHqCatalogBranchContext } from '@/hooks/useHqCatalogBranchEdit.ts';

type Props = {
  /** The existing Add / Import button element from the list page. */
  children: ReactElement;
};

/**
 * Disables create/import actions while HQ is Editing for one or more branches.
 * Base catalog mode leaves the child button unchanged.
 */
export function HqCatalogBaseOnlyAction({ children }: Props) {
  const { t } = useTranslation(['admin']);
  const { canCreateBaseEntities } = useHqCatalogBranchContext();

  if (!isValidElement(children)) return children;
  if (canCreateBaseEntities) return children;

  const child = children as ReactElement<any>;
  return cloneElement(child, {
    disabled: true,
    title: t('admin:hqBranchEdit.createBlocked'),
    onClick: (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      toast.error(t('admin:hqBranchEdit.createBlocked'));
    },
  });
}
