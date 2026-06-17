import { useTranslation } from 'react-i18next';
import {REPORTS_AUDIT} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";

export const AuditFilter = () => {
  const { t } = useTranslation('reports');
  return (
    <form
      action={REPORTS_AUDIT}
      className="flex flex-col gap-3 items-start"
      target="_blank"
    >
      <DateRange isRequired label="Select a range" />

      <Button
        variant="primary"
        filled
        type="submit"
      >{t('filters.generate')}</Button>
    </form>
  );
}