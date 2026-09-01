import AntCalendar from "antd/es/calendar";
import { DateValue } from "react-aria-components";
import { dayjsToCalendarDate, dateValueToDayjs } from "@/utils/date.ts";

interface Props {
  value?: DateValue;
  onChange?: (value: DateValue) => void;
  maxValue?: DateValue;
  minValue?: DateValue;
}

export const Calendar = ({
  value,
  onChange,
  maxValue,
  minValue,
}: Props) => {
  const selectedValue = dateValueToDayjs(value);
  const maxDate = dateValueToDayjs(maxValue);
  const minDate = dateValueToDayjs(minValue);

  return (
    <AntCalendar
      className="app-ant-picker"
      value={selectedValue ?? undefined}
      fullscreen={false}
      validRange={
        minDate && maxDate
          ? [minDate, maxDate]
          : undefined
      }
      disabledDate={(current) => {
        if (maxDate && current.isAfter(maxDate, "day")) return true;
        if (minDate && current.isBefore(minDate, "day")) return true;
        return false;
      }}
      onSelect={(next) => {
        const converted = dayjsToCalendarDate(next);
        if (converted) {
          onChange?.(converted);
        }
      }}
    />
  );
};
