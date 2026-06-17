import { useTranslation } from 'react-i18next';
import { REPORTS_TIPS } from "@/routes/posr.ts";
import { DateRange } from "@/components/reports/filters/date.range.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { Shift } from "@/api/model/shift.ts";

export const TipsFilter = () => {
  const { t } = useTranslation('reports');
  const { data: shiftsData, isLoading } = useApi<SettingsData<Shift>>(Tables.shifts, [], ["name asc"], 0, 9999);

  return (
    <form action={REPORTS_TIPS} className="flex flex-col gap-3 items-start w-full" target="_blank">
      <DateRange isRequired label="Select a range" />

      <div className="w-full">
        <label htmlFor="tips-shift">Shift</label>
        <ReactSelect
          id="tips-shift"
          name="shift"
          isClearable
          isLoading={isLoading}
          options={(shiftsData?.data || []).map((shift) => ({
            label: shift.name,
            value: shift.id.toString(),
          }))}
        />
      </div>

      <Button variant="primary" filled type="submit">{t('filters.generate')}</Button>
    </form>
  );
};
