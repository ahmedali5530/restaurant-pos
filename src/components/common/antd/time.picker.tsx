import { TimePicker as AntTimePicker } from "antd";
import dayjs, { Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { antPickerPopupProps } from "@/components/common/antd/picker.shared.ts";

dayjs.extend(customParseFormat);

interface Props {
  label?: string;
  name?: string;
  value?: string | null;
  onChange?: (value: string) => void;
  isClearable?: boolean;
  disabled?: boolean;
}

export const timeStringToDayjs = (value?: string | null): Dayjs | null => {
  if (!value) return null;
  const parsed = dayjs(value, "HH:mm", true);
  return parsed.isValid() ? parsed : null;
};

export const TimePicker = ({
  label,
  name,
  value,
  onChange,
  isClearable = false,
  disabled = false,
}: Props) => {
  const selectedTime = timeStringToDayjs(value);

  return (
    <div className="flex flex-col" data-react-aria-top-layer="true">
      {label && <label>{label}</label>}
      <AntTimePicker
        className="w-full app-ant-picker"
        value={selectedTime}
        allowClear={isClearable}
        disabled={disabled}
        format="HH:mm"
        onChange={(nextValue) => {
          onChange?.(nextValue?.format("HH:mm") ?? "");
        }}
        {...antPickerPopupProps}
      />
      {name && (
        <input
          type="hidden"
          name={name}
          value={value ?? ""}
        />
      )}
    </div>
  );
};
