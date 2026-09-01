import { useTranslation } from 'react-i18next';
import {REPORTS_SALE_VS_CONSUMPTION} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";

export const SaleVsConsumptionFilter = () => {
  const { t } = useTranslation('reports');
  return (
    <form
      action={REPORTS_SALE_VS_CONSUMPTION}
      className="flex flex-col gap-4 items-start w-full"
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
};












