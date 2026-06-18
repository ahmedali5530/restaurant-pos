import { DatePicker as AntDatePicker } from "antd";
import { DateValue } from "react-aria-components";
import { dayjsToCalendarDate, dateValueToDayjs } from "@/utils/date.ts";

interface Props {
  label?: string;
  name?: string;
  value?: DateValue | null;
  onChange?: (value: DateValue | null) => void;
  isClearable?: boolean;
  maxValue?: DateValue;
  minValue?: DateValue;
  disabled?: boolean;
}

export const DatePicker = ({
  label,
  name,
  value,
  onChange,
  isClearable = false,
  maxValue,
  minValue,
  disabled = false,
}: Props) => {
  const selectedDate = dateValueToDayjs(value);

  return (
    <div className="flex flex-col" data-react-aria-top-layer="true">
      {label && <label>{label}</label>}
      <AntDatePicker
        className="w-full app-ant-picker"
        value={selectedDate}
        allowClear={isClearable}
        disabled={disabled}
        maxDate={dateValueToDayjs(maxValue)}
        minDate={dateValueToDayjs(minValue)}
        onChange={(nextValue) => {
          onChange?.(dayjsToCalendarDate(nextValue));
        }}
        getPopupContainer={(trigger) => trigger.parentElement}
      />
      {name && (
        <input
          type="hidden"
          name={name}
          value={value ? value.toString() : ""}
        />
      )}
    </div>
  );
};
