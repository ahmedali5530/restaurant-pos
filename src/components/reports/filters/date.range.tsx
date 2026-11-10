import {DateRangePicker} from "@/components/common/antd/date.range.picker.tsx";
import {useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {DateTime} from "luxon";
import { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {getAppTimezone} from "@/lib/datetime.ts";
import {
  type ClosingCycleConfig,
  loadClosingCycleConfigFromCatalog,
} from "@/lib/closing-cycle.ts";
import {formatReportRangeForQuery} from "@/lib/kitchen/business-date.ts";

interface DateRangeProps {
  startName?: string;
  endName?: string;
  label?: string;
  isRequired?: boolean;
}

function businessDateKey(dt: DateTime): string {
  return dt.toFormat("yyyy-MM-dd");
}

function buildPresetRange(
  config: ClosingCycleConfig | null,
  startDay: DateTime,
  endDay: DateTime,
): [string, string] {
  const {startDate, endDate} = formatReportRangeForQuery(
    config,
    businessDateKey(startDay),
    businessDateKey(endDay),
  );
  return [startDate, endDate];
}

export function DateRange({
  startName = "start",
  endName = "end",
  label = "Select a range",
  isRequired = false,
}: DateRangeProps) {
  const { t } = useTranslation('reports');
  const [cycleConfig, setCycleConfig] = useState<ClosingCycleConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadClosingCycleConfigFromCatalog()
      .then(({config}) => {
        if (!cancelled) setCycleConfig(config);
      })
      .catch(() => {
        if (!cancelled) setCycleConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const now = () => DateTime.now().setZone(getAppTimezone());

  const dates = useMemo(() => {
    const n = now();
    return {
      "Today": buildPresetRange(cycleConfig, n, n).join("to"),
      "Yesterday": buildPresetRange(cycleConfig, n.minus({day: 1}), n.minus({day: 1})).join("to"),
      "This week": buildPresetRange(cycleConfig, n.startOf("week"), n.endOf("week")).join("to"),
      "Last week": buildPresetRange(
        cycleConfig,
        n.minus({week: 1}).startOf("week"),
        n.minus({week: 1}).endOf("week"),
      ).join("to"),
      "This month": buildPresetRange(cycleConfig, n.startOf("month"), n.endOf("month")).join("to"),
      "Last month": buildPresetRange(
        cycleConfig,
        n.minus({month: 1}).startOf("month"),
        n.minus({month: 1}).endOf("month"),
      ).join("to"),
      "This year": buildPresetRange(cycleConfig, n.startOf("year"), n.endOf("year")).join("to"),
      "Last year": buildPresetRange(
        cycleConfig,
        n.minus({year: 1}).startOf("year"),
        n.minus({year: 1}).endOf("year"),
      ).join("to"),
      "All time": "to",
      "Custom": "CUS",
    };
  }, [cycleConfig]);

  const todayPreset = useMemo(
    () => buildPresetRange(cycleConfig, now(), now()),
    [cycleConfig],
  );

  const [isCustom, setCustom] = useState(false);
  const [preset, setPreset] = useState<[string, string]>(todayPreset);
  const [customRange, setCustomRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  useEffect(() => {
    if (!isCustom) {
      setPreset(todayPreset);
    }
  }, [todayPreset, isCustom]);

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
            setPreset([value[0] || '', value[1] || '']);
            setCustom(false);
          }
        }}
        className="form-control self-center"
      >
        {Object.keys(dates).map(item => (
          <option key={item} value={dates[item as keyof typeof dates]}>{item}</option>
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
              if (!nextValue || !nextValue[0] || !nextValue[1]) {
                setCustomRange(nextValue);
                return;
              }
              const startKey = nextValue[0].format("YYYY-MM-DD");
              const endKey = nextValue[1].format("YYYY-MM-DD");
              const {startDate, endDate} = formatReportRangeForQuery(cycleConfig, startKey, endKey);
              const zone = getAppTimezone();
              const fmt = import.meta.env.VITE_DATE_TIME_FORMAT as string;
              const startDt = DateTime.fromFormat(startDate, fmt, {zone});
              const endDt = DateTime.fromFormat(endDate, fmt, {zone});
              setCustomRange([
                dayjs(startDt.isValid ? startDt.toISO() : nextValue[0].toISOString()),
                dayjs(endDt.isValid ? endDt.toISO() : nextValue[1].toISOString()),
              ]);
            }}
          />
        </div>
      )}
    </div>
  );
}
