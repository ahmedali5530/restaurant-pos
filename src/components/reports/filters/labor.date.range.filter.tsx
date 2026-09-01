import { useTranslation } from 'react-i18next';
import {DateRange} from '@/components/reports/filters/date.range.tsx';
import {Button} from '@/components/common/input/button.tsx';

export const LaborDateRangeFilter = ({action}: {action: string}) => {
  const { t } = useTranslation('reports');
  return (
    <form action={action} className="flex flex-col gap-3 items-start" target="_blank">
      <DateRange isRequired label={t('filters.selectRange')} />
      <Button variant="primary" filled type="submit">{t('filters.generate')}</Button>
    </form>
  );
};
