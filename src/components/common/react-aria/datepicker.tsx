import {
  Button,
  DateInput,
  DatePicker as BaseDatePicker,
  DatePickerProps,
  DatePickerStateContext,
  DateSegment,
  DateValue,
  Group,
  Label,
  ValidationResult
} from 'react-aria-components';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {faCalendar} from "@fortawesome/free-solid-svg-icons";
import { Popover } from "@/components/common/react-aria/popover.tsx";
import { useContext } from "react";
import { Calendar } from "@/components/common/react-aria/calendar.tsx";

interface Props<T extends DateValue> extends DatePickerProps<T> {
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  isClearable?: boolean
}

export function DatePicker<T extends DateValue>({
  label, description, errorMessage, isClearable, ...props
}: Props<T>) {
  return (
    <>
      <BaseDatePicker className="group flex flex-col" {...props}>
        {label && <Label>{label}</Label>}
        <Group className="flex rounded-lg text-neutral-500 border-2 border-neutral-900 h-[40px] gap-3">
          <DateInput className="flex flex-1 py-2 px-3">
            {(segment) => (
              <DateSegment
                segment={segment}
                className="px-0.5 tabular-nums outline-none rounded-sm focus:bg-violet-700 focus:bg-neutral-900 focus:text-white caret-transparent placeholder-shown:italic"
              />
            )}
          </DateInput>
          {isClearable && props.value && (
            <DatePickerClearButton/>
          )}
          <Button
            className="outline-none px-3 flex items-center text-gray-700 transition border-0 border-solid border-l border-l-purple-200 bg-transparent rounded-r-lg pressed:bg-purple-100 focus-visible:ring-2 ring-black">
            <FontAwesomeIcon icon={faCalendar} size="xs"/>
          </Button>
        </Group>
        <Popover>
          <Calendar />
        </Popover>
      </BaseDatePicker>
    </>
  );
}

function DatePickerClearButton() {
  const state = useContext(DatePickerStateContext)!;
  return (
    <Button
      // Don't inherit default Button behavior from DatePicker.
      slot={null}
      className="clear-button"
      aria-label="Clear"
      onPress={() => state.setValue(null)}>
      ✕
    </Button>
  );
}
