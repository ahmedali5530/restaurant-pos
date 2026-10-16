import {REPORTS_CASH_CLOSING} from "@/routes/posr.ts";
import {Button} from "@/components/common/input/button.tsx";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {getLocalTimeZone, today} from "@internationalized/date";
import {DateValue} from "react-aria-components";
import {useState} from "react";
import { useTranslation } from 'react-i18next';
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { Shift } from "@/api/model/shift.ts";

type ShiftOption = { label: string; value: string };

export const CashClosingFilter = () => {
  const { t } = useTranslation('reports');
  const [selectedDate, setSelectedDate] = useState<DateValue | null>(today(getLocalTimeZone()));
  const [selectedShift, setSelectedShift] = useState<ShiftOption | null>(null);
  const { data: shiftsData, isLoading } = useApi<SettingsData<Shift>>(Tables.shifts, ["deleted_at = none"], ["name asc"], 0, 9999);

  return (
    <form
      action={REPORTS_CASH_CLOSING}
      className="flex flex-col gap-3 items-start w-full"
      target="_blank"
    >
      <div className="w-full">
        <DatePicker
          label={t('filters.selectDate', { defaultValue: 'Select date' })}
          name="date"
          value={selectedDate}
          onChange={setSelectedDate}
          maxValue={today(getLocalTimeZone())}
          isClearable
        />
      </div>

      <div className="w-full">
        <label htmlFor="cash-closing-shift" className="form-label">
          {t('labels.shift', { defaultValue: 'Shift' })}
        </label>
        <ReactSelect
          id="cash-closing-shift"
          isClearable
          isLoading={isLoading}
          placeholder={t('filters.allShifts', { defaultValue: 'All shifts for the day' })}
          options={(shiftsData?.data || []).map((shift) => ({
            label: shift.name,
            value: shift.id.toString(),
          }))}
          value={selectedShift}
          onChange={(option) => setSelectedShift(option as ShiftOption | null)}
        />
        <input type="hidden" name="shift" value={selectedShift?.value || ""} />
        <p className="text-xs text-muted mt-1">
          {t('filters.cashClosingShiftHint', {
            defaultValue: 'Leave empty to open every closing for that day and switch between shifts in the report.',
          })}
        </p>
      </div>

      <Button
        variant="primary"
        filled
        type="submit"
        disabled={!selectedDate}
      >{t('filters.generate')}</Button>
    </form>
  );
};
