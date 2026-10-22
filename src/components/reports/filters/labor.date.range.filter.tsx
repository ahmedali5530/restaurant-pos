import { useTranslation } from 'react-i18next';
import {DateRange} from '@/components/reports/filters/date.range.tsx';
import {BranchScopeFilter} from '@/components/reports/filters/branch.scope.filter.tsx';
import {Button} from '@/components/common/input/button.tsx';

export const LaborDateRangeFilter = ({
  action,
  includeBranchScope = false,
}: {
  action: string;
  includeBranchScope?: boolean;
}) => {
  const { t } = useTranslation('reports');
  return (
    <form action={action} className="flex flex-col gap-3 items-start" target="_blank">
      <DateRange isRequired label={t('filters.selectRange')} />
      {includeBranchScope ? <BranchScopeFilter /> : null}
      <Button variant="primary" filled type="submit">{t('filters.generate')}</Button>
    </form>
  );
};
