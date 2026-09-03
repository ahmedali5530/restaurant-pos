import {
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading, Calendar as BaseCalendar, type ButtonProps, Button, DateValue, CalendarProps
} from "react-aria-components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";

interface MyCalendarProps<T extends DateValue> extends CalendarProps<T> {
  errorMessage?: string;
}

export function Calendar<T extends DateValue> (
  { errorMessage, ...props }: MyCalendarProps<T>
) {
  return (
    <BaseCalendar {...props}>
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
    </BaseCalendar>
  );
}

export function RoundButton(props: ButtonProps) {
  return (
    <Button
      {...props}
      className="w-10 h-10 outline-none cursor-default bg-transparent text-gray-600 border-0 rounded-full flex items-center justify-center hover:bg-gray-100 pressed:bg-gray-200 focus-visible:ring ring-violet-600/70 ring-offset-2"
    />
  );
}
