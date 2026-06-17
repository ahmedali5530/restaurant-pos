import { useTranslation } from 'react-i18next';
import {REPORTS_SALES_HOURLY_LABOUR} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import _ from "lodash";

export const SalesHourlyLabourFilter = () => {
  const { t } = useTranslation('reports');
  return (
    <form
      action={REPORTS_SALES_HOURLY_LABOUR}
      className="flex flex-col gap-3 items-start"
      target="_blank"
    >
      <DateRange isRequired label="Select a range"/>

      <div>
        <label htmlFor="hours">{t('metrics.hours')}</label>
        <ReactSelect name="hours[]" isMulti options={_.range(0, 23).map(item => ({
          label: item,
          value: item
        }))} id="hours" className="flex-1 self-stretch" />
      </div>

      <Button
        variant="primary"
        filled
        type="submit"
      >{t('filters.generate')}</Button>
    </form>
  );
}