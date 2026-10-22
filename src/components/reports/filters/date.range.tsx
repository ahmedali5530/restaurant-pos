import {DateRangePicker} from "@/components/common/antd/date.range.picker.tsx";
import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {DateTime} from "luxon";
import { Dayjs } from "dayjs";
import {getAppTimezone} from "@/lib/datetime.ts";
import { runtimeDateTimeFormat } from "@/lib/runtime-config.ts";

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
  const now = () => DateTime.now().setZone(getAppTimezone());
  const todayStart = now().startOf("day").toFormat(runtimeDateTimeFormat());
  const todayEnd = now().endOf("day").toFormat(runtimeDateTimeFormat());
  const dates = {
    "Today": `${todayStart}to${todayEnd}`,
    "Yesterday": `${now().minus({'day': 1}).startOf("day").toFormat(runtimeDateTimeFormat())}to${now().minus({'day': 1}).endOf("day").toFormat(runtimeDateTimeFormat())}`,
    "This week": `${now().startOf('week').toFormat(runtimeDateTimeFormat())}to${now().endOf('week').toFormat(runtimeDateTimeFormat())}`,
    "Last week": `${now().minus({week: 1}).startOf('week').toFormat(runtimeDateTimeFormat())}to${now().minus({week: 1}).endOf('week').toFormat(runtimeDateTimeFormat())}`,
    "This month": `${now().startOf('month').toFormat(runtimeDateTimeFormat())}to${now().endOf('month').toFormat(runtimeDateTimeFormat())}`,
    "Last month": `${now().minus({month: 1}).startOf('month').toFormat(runtimeDateTimeFormat())}to${now().minus({month: 1}).endOf('month').toFormat(runtimeDateTimeFormat())}`,
    "This year": `${now().startOf('year').toFormat(runtimeDateTimeFormat())}to${now().endOf('year').toFormat(runtimeDateTimeFormat())}`,
    "Last year": `${now().minus({year: 1}).startOf('year').toFormat(runtimeDateTimeFormat())}to${now().minus({year: 1}).endOf('year').toFormat(runtimeDateTimeFormat())}`,
    "All time": "to",
    "Custom": "CUS"
  }

  const [isCustom, setCustom] = useState(false);
  const [preset, setPreset] = useState([todayStart, todayEnd]);
  const [customRange, setCustomRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  return (
    <div className="flex flex-col w-full">
      <label htmlFor="date-preset" className="form-label">{label}</label>
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