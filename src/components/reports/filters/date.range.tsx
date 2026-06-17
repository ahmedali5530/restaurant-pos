import {DateRangePicker} from "@/components/common/antd/date.range.picker.tsx";
import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {DateTime} from "luxon";
import { Dayjs } from "dayjs";

interface DateRangeProps {
  startName?: string;
  endName?: string;
  label?: string;
  isRequired?: boolean;
}

export function DateRange({
  startName = "start",
  endName = "end",
  label = "Select a range",
  isRequired = false,
}: DateRangeProps) {
  const { t } = useTranslation('reports');
  const todayStart = DateTime.now().startOf("day").toFormat(import.meta.env.VITE_DATE_TIME_FORMAT);
  const todayEnd = DateTime.now().endOf("day").toFormat(import.meta.env.VITE_DATE_TIME_FORMAT);
  const dates = {
    "Today": `${todayStart}to${todayEnd}`,
    "Yesterday": `${DateTime.now().minus({'day': 1}).startOf("day").toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}to${DateTime.now().minus({'day': 1}).endOf("day").toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}`,
    "This week": `${DateTime.now().startOf('week').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}to${DateTime.now().endOf('week').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}`,
    "Last week": `${DateTime.now().minus({week: 1}).startOf('week').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}to${DateTime.now().minus({week: 1}).endOf('week').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}`,
    "This month": `${DateTime.now().startOf('month').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}to${DateTime.now().endOf('month').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}`,
    "Last month": `${DateTime.now().minus({month: 1}).startOf('month').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}to${DateTime.now().minus({month: 1}).endOf('month').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}`,
    "This year": `${DateTime.now().startOf('year').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}to${DateTime.now().endOf('year').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}`,
    "Last year": `${DateTime.now().minus({year: 1}).startOf('year').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}to${DateTime.now().minus({year: 1}).endOf('year').toFormat(import.meta.env.VITE_DATE_TIME_FORMAT)}`,
    "All time": "to",
    "Custom": "CUS"
  }

  const [isCustom, setCustom] = useState(false);
  const [preset, setPreset] = useState([todayStart, todayEnd]);
  const [customRange, setCustomRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  return (
    <div className="flex flex-col w-full">
      <label htmlFor="date-preset">{label}</label>
      <select
        id="date-preset"
        onChange={(event) => {
          const value = event.target.value.split('to');
          if(value[0] === 'CUS') {
            setCustom(true);
          }else {
            setPreset(value);
            setCustom(false);
          }
        }}
        className="form-control self-center"
      >
        {Object.keys(dates).map(item => (
          <option key={item} value={dates[item]}>{item}</option>
        ))}
      </select>
      {!isCustom && (
        <>
          <input type="hidden" name={startName} value={preset[0]} required={isRequired}/>
          <input type="hidden" name={endName} value={preset[1]} required={isRequired}/>
        </>
      )}
      {isCustom && (
        <div className="mt-3">
          <DateRangePicker
            startName={startName}
            endName={endName}
            required={isRequired}
            value={customRange}
            onChange={(nextValue) => {
              setCustomRange(nextValue);
            }}
          />
        </div>
      )}

    </div>
  );
}