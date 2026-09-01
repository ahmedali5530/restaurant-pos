import {
  Button,
  CalendarCell,
  CalendarGrid,
  DateInput,
  DateRangePicker as BaseDateRangePicker,
  ValidationResult,
  DateRangePickerProps as BaseDateRangePickerProps,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Label,
  Popover,
  RangeCalendar,
  DateValue,
  CalendarGridHeader, CalendarHeaderCell, CalendarGridBody
} from 'react-aria-components';
import {faCalendar, faChevronLeft, faChevronRight} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {RoundButton} from "@/components/common/react-aria/calendar.tsx";


interface DateRangePickerProps<T extends DateValue> extends BaseDateRangePickerProps<T> {
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
}

export function DateRangePicker<T extends DateValue>({
  label, description, errorMessage, firstDayOfWeek, ...props
}: DateRangePickerProps<T>){
  return (
    <BaseDateRangePicker className="group flex flex-col gap-1 flex-0" {...props}>
      <Label>{label}</Label>
      <Group className="flex rounded-lg text-neutral-500 border-2 border-neutral-900 h-[40px] gap-3 px-3 items-center">
        <DateInput slot="start" className="flex flex-1 py-2">
          {(segment) => (
            <DateSegment segment={segment} className="px-0.5 tabular-nums outline-none rounded-sm focus:bg-violet-700 focus:bg-neutral-900 focus:text-white caret-transparent placeholder-shown:italic" />
          )}
        </DateInput>
        <span aria-hidden="true">–</span>
        <DateInput slot="end" className="flex flex-1 py-2">
          {(segment) => (
            <DateSegment segment={segment} className="px-0.5 tabular-nums outline-none rounded-sm focus:bg-violet-700 focus:bg-neutral-900 focus:text-white caret-transparent placeholder-shown:italic" />
          )}
        </DateInput>
        <Button>
          <FontAwesomeIcon icon={faCalendar} size="xs"/>
        </Button>
      </Group>
      <Popover>
        <Dialog>
          <RangeCalendar className="bg-white">
            <header className="flex items-center gap-1 pb-4 px-1 font-serif w-full">
              <Heading className="flex-1 font-semibold text-2xl ml-2"/>
              <RoundButton slot="previous">
                <FontAwesomeIcon icon={faChevronLeft}/>
              </RoundButton>
              <RoundButton slot="next">
                <FontAwesomeIcon icon={faChevronRight}/>
              </RoundButton>
            </header>
            <CalendarGrid className="border-spacing-1 border-separate">
              <CalendarGridHeader>
                {(day) => (
                  <CalendarHeaderCell className="text-xs text-gray-500 font-semibold">
                    {day}
                  </CalendarHeaderCell>
                )}
              </CalendarGridHeader>
              <CalendarGridBody>
                {(date) => (
                  <CalendarCell
                    date={date}
                    className="react-aria-CalendarCell w-12 h-12 outline-none cursor-default rounded-full flex items-center justify-center outside-month:text-gray-300 hover:bg-gray-100 pressed:bg-gray-200 selected:bg-neutral-700 selected:text-white focus-visible:ring ring-violet-600/70 ring-offset-2"
                  />
                )}
              </CalendarGridBody>
            </CalendarGrid>
          </RangeCalendar>
        </Dialog>
      </Popover>
    </BaseDateRangePicker>
  );
}