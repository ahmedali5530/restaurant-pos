import { DatePicker } from "antd";
import { Dayjs } from "dayjs";

const { RangePicker } = DatePicker;

type DateRangeTuple = [Dayjs | null, Dayjs | null];

interface Props {
  label?: string;
  startName?: string;
  endName?: string;
  value?: DateRangeTuple | null;
  onChange?: (value: DateRangeTuple | null, dateStrings: [string, string]) => void;
  isClearable?: boolean;
  disabled?: boolean;
  required?: boolean;
}

export const DateRangePicker = ({
  label,
  startName = "start",
  endName = "end",
  value,
  onChange,
  isClearable = true,
  disabled = false,
  required = false,
}: Props) => {
  const selectedValue: [Dayjs, Dayjs] | null =
    value && value[0] && value[1]
      ? [value[0], value[1]]
      : null;

  const startValue = value?.[0]?.format("YYYY-MM-DD HH:mm") ?? "";
  const endValue = value?.[1]?.format("YYYY-MM-DD HH:mm") ?? "";

  return (
    <div className="flex flex-col" data-react-aria-top-layer="true">
      {label && <label>{label}</label>}
      <RangePicker
        className="w-full app-ant-picker"
        value={selectedValue}
        allowClear={isClearable}
        disabled={disabled}
        showTime={{ format: "HH:mm" }}
        format="YYYY-MM-DD HH:mm"
        onChange={(nextValue, dateStrings) => {
          if (!nextValue) {
            onChange?.(null, dateStrings as [string, string]);
            return;
          }

          onChange?.([
            nextValue[0],
            nextValue[1],
          ], dateStrings as [string, string]);
        }}
        getPopupContainer={(trigger) => trigger.parentElement}
      />
      <input type="hidden" name={startName} value={startValue} required={required}/>
      <input type="hidden" name={endName} value={endValue} required={required}/>
    </div>
  );
};