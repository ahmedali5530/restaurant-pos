import {REPORTS_CASH_CLOSING} from "@/routes/posr.ts";
import {Button} from "@/components/common/input/button.tsx";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {getLocalTimeZone, today} from "@internationalized/date";
import {DateValue} from "react-aria-components";
import {useState} from "react";
import { useTranslation } from 'react-i18next';

export const CashClosingFilter = () => {
  const { t } = useTranslation('reports');
  const [selectedDate, setSelectedDate] = useState<DateValue | null>(today(getLocalTimeZone()));

  return (
    <form
      action={REPORTS_CASH_CLOSING}
      className="flex flex-col gap-3 items-start"
      target="_blank"
    >
      <div className="w-full">
        <DatePicker
          label="Select date"
          name="date"
          value={selectedDate}
          onChange={setSelectedDate}
          maxValue={today(getLocalTimeZone())}
          isClearable
        />
      </div>

      <Button
        variant="primary"
        filled
        type="submit"
        disabled={!selectedDate}
      >{t('filters.generate')}</Button>
    </form>
  );
}