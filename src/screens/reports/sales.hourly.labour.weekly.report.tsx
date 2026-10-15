import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {TimeEntry} from "@/api/model/time_entry.ts";
import {calculateOrderTotal} from "@/lib/cart.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {DateTime} from "luxon";
import { getAppTimezone, toLuxonDateTime } from "@/lib/datetime.ts";
import {getOrderPaymentTotals} from "@/lib/order.ts";
import {buildCreatedAtDateConditions, toReportBoundaryUtcIso} from "@/api/reports/shared/query.ts";

import {useReportBranchScope} from "@/hooks/useReportBranchScope.ts";
import {BranchBreakdown} from "@/components/reports/branch.breakdown.tsx";
import {getRowBranchId} from "@/api/reports/shared/branch-scope.ts";
import {buildBranchInsideCondition} from "@/api/reports/shared/query.ts";

type WeekdayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
type MetricKey = 'amountCollected' | 'grossSales' | 'couponAmount' | 'labourMinutes';

interface HourlyMetricData {
  amountCollected: Record<WeekdayName, number>;
  grossSales: Record<WeekdayName, number>;
  couponAmount: Record<WeekdayName, number>;
  labourMinutes: Record<WeekdayName, number>;
}

interface HourlyRow {
  id: string;
  hourLabel: string;
  metricLabel: string;
  values: number[];
  total: number;
  formatter: (value: number) => string;
}

const WEEK_DAYS: WeekdayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const formatHourLabel = (hour: number) => {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const value = hour % 12 || 12;
  return `${value.toString().padStart(2, '0')}:00 ${suffix}`;
};

const sumPayments = (order: Order) => getOrderPaymentTotals(order).amountCollected;

const parseWeekParams = () => {
  const params = new URLSearchParams(window.location.search);
  const weekParam = params.get('week');

  const timezone = getAppTimezone();
  let weekStart = weekParam ? DateTime.fromISO(weekParam, {zone: timezone}) : DateTime.now().setZone(timezone);
  if (!weekStart.isValid) {
    weekStart = DateTime.now().setZone(timezone);
  }
  weekStart = weekStart.startOf('week');
  const weekEnd = weekStart.plus({days: 6});
  const dateTimeFormat = import.meta.env.VITE_DATE_TIME_FORMAT as string;

  return {
    weekStart,
    weekEnd,
    weekStartISO: weekStart.toISODate(),
    weekEndISO: weekEnd.toISODate(),
    // Full day bounds so a date-only end still includes the last day
    queryStart: weekStart.startOf('day').toFormat(dateTimeFormat),
    queryEnd: weekEnd.endOf('day').toFormat(dateTimeFormat),
  };
};

const createEmptyDayRecord = () => {
  return WEEK_DAYS.reduce((acc, day) => {
    acc[day] = 0;
    return acc;
  }, {} as Record<WeekdayName, number>);
};

export const SalesHourlyLabourWeeklyReport = () => {
  const { t } = useTranslation('reports');
  const METRICS = useMemo<{ key: MetricKey; label: string; formatter: (value: number) => string }[]>(() => [
    { key: 'amountCollected', label: t('labels.amountCollected'), formatter: withCurrency },
    { key: 'grossSales', label: t('columns.grossSales'), formatter: withCurrency },
    { key: 'couponAmount', label: t('metrics.couponAmount'), formatter: withCurrency },
    { key: 'labourMinutes', label: t('metrics.labourHoursMins'), formatter: (value) => formatNumber(value) },
  ], [t]);
  const db = useDB();
  const branchScope = useReportBranchScope();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {weekStart, weekEnd, weekStartISO, weekEndISO, queryStart, queryEnd} = useMemo(parseWeekParams, []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    if (!branchScope.ready) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const {conditions: dateConditions, params} = buildCreatedAtDateConditions(
          {startDate: queryStart, endDate: queryEnd},
          "created_at",
        );
        const branchFilter = buildBranchInsideCondition(branchScope.branchIds);
        if (branchFilter.emptyResult) {
          setOrders([]);
          setTimeEntries([]);
          return;
        }
        if (branchFilter.condition) {
          dateConditions.push(branchFilter.condition);
          Object.assign(params, branchFilter.params);
        }

        const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          WHERE status = 'Paid'
            AND ${dateConditions.join(' AND ')}
          FETCH payments, items, items.item, items.item.categories, coupon, coupon.coupon
        `;

        // Overlap check: the time entry spans any part of the week.
        const timeEntryParams: Record<string, any> = {
          rangeStart: toReportBoundaryUtcIso(queryStart),
          rangeEnd: toReportBoundaryUtcIso(queryEnd),
        };
        const timeEntryConditions = [
          "clock_out != NONE",
          "clock_in <= <datetime>$rangeEnd",
          "clock_out >= <datetime>$rangeStart",
        ];
        if (branchFilter.condition) {
          timeEntryConditions.push(branchFilter.condition);
          Object.assign(timeEntryParams, branchFilter.params);
        }
        const timeEntriesQuery = `
          SELECT * FROM ${Tables.time_entries}
          WHERE ${timeEntryConditions.join(' AND ')}
        `;

        const [ordersResult, timeEntriesResult]: any = await Promise.all([
          queryRef.current(ordersQuery, params),
          queryRef.current(timeEntriesQuery, timeEntryParams),
        ]);

        setOrders((ordersResult?.[0] ?? []) as Order[]);
        setTimeEntries((timeEntriesResult?.[0] ?? []) as TimeEntry[]);
      } catch (err) {
        console.error('Failed to load weekly labour report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [branchScope.ready, branchScope.branchIds, queryStart, queryEnd]);


  const dayHeaders = useMemo(() => {
    return WEEK_DAYS.map((day, index) => ({
      day,
      dateLabel: weekStart.plus({days: index}).toFormat('yyyy-LL-dd'),
    }));
  }, [weekStart]);

  const subtitle = `${weekStartISO} to ${weekEndISO}`;

  if (loading || !branchScope.ready) {
    return (
      <ReportsLayout title={t('reports.salesHourlyLabourWeekly')} subtitle={subtitle}>
        <div className="text-center p-6">{t('loading.weeklyLabour')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('reports.salesHourlyLabourWeekly')} subtitle={subtitle}>
        <div className="text-center p-6 text-danger-600">
          {t('errors.failedToLoad', { error })}
        </div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('reports.salesHourlyLabourWeekly')}
      subtitle={subtitle}
    >
      <BranchBreakdown
        enabled={branchScope.isByBranch}
        rows={orders}
        labels={branchScope.branchLabels}
        branchOrder={branchScope.branchOrder}
        renderSection={({rows, key}) => {
          const entriesForSection =
            !branchScope.isByBranch || key === "total" || key === "combined"
              ? timeEntries
              : timeEntries.filter((e) => getRowBranchId(e) === key);
          return (
            <SalesHourlyLabourWeeklyBody
              key={key}
              orders={rows}
              timeEntries={entriesForSection}
              weekStart={weekStart}
              weekEnd={weekEnd}
              dayHeaders={dayHeaders}
              METRICS={METRICS}
            />
          );
        }}
      />
    </ReportsLayout>
  );
}

const SalesHourlyLabourWeeklyBody = ({
  orders,
  timeEntries,
  weekStart,
  weekEnd,
  dayHeaders,
  METRICS,
}: {
  orders: Order[];
  timeEntries: TimeEntry[];
  weekStart: DateTime;
  weekEnd: DateTime;
  dayHeaders: {day: WeekdayName; dateLabel: string}[];
  METRICS: { key: MetricKey; label: string; formatter: (value: number) => string }[];
}) => {
  const { t } = useTranslation('reports');

  const rows: HourlyRow[] = useMemo(() => {
    const emptyHours: HourlyMetricData[] = Array.from({length: 24}, () => ({
      amountCollected: createEmptyDayRecord(),
      grossSales: createEmptyDayRecord(),
      couponAmount: createEmptyDayRecord(),
      labourMinutes: createEmptyDayRecord(),
    }));

    const withinWeek = (date: DateTime) =>
      date >= weekStart.startOf('day') && date <= weekEnd.endOf('day');

    orders.forEach((order) => {
      const created = toLuxonDateTime(order.created_at);
      if (!withinWeek(created)) {
        return;
      }

      const dayIndex = created.weekday - 1;
      const hour = created.hour;
      const dayName = WEEK_DAYS[dayIndex] as WeekdayName | undefined;
      if (dayName === undefined) {
        return;
      }

      const amountCollected = sumPayments(order);
      const grossSale = Number(calculateOrderTotal(order)) || 0;
      const couponAmount = Number(order.coupon?.discount) || 0;

      emptyHours[hour].amountCollected[dayName] += amountCollected;
      emptyHours[hour].grossSales[dayName] += grossSale;
      emptyHours[hour].couponAmount[dayName] += couponAmount;
    });

    const weekStartBoundary = weekStart.startOf('day');
    const weekEndBoundary = weekEnd.endOf('day');

    timeEntries.forEach((entry) => {
      if (!entry.clock_in || !entry.clock_out) {
        return;
      }

      let start = toLuxonDateTime(entry.clock_in);
      let end = toLuxonDateTime(entry.clock_out);
      if (!start.isValid || !end.isValid || end <= start) {
        return;
      }

      if (end < weekStartBoundary || start > weekEndBoundary) {
        return;
      }

      if (start < weekStartBoundary) {
        start = weekStartBoundary;
      }
      if (end > weekEndBoundary) {
        end = weekEndBoundary;
      }

      let current = start.startOf('hour');
      if (current < start) {
        // current = current;
      }

      while (current < end) {
        const nextHour = current.plus({hours: 1});
        const overlapStart = current < start ? start : current;
        const overlapEnd = nextHour > end ? end : nextHour;

        const minutes = overlapEnd.diff(overlapStart, 'minutes').minutes;
        if (minutes > 0) {
          const dayIndex = overlapStart.weekday - 1;
          const dayName = WEEK_DAYS[dayIndex] as WeekdayName | undefined;
          if (dayName !== undefined) {
            const hour = current.hour;
            emptyHours[hour].labourMinutes[dayName] += minutes;
          }
        }

        current = nextHour;
      }
    });

    const generatedRows: HourlyRow[] = [];

    emptyHours.forEach((hourData, hour) => {
      METRICS.forEach((metric, metricIndex) => {
        const values = WEEK_DAYS.map((day) => hourData[metric.key][day]);
        const total = values.reduce((sum, value) => sum + value, 0);
        generatedRows.push({
          id: `${hour}-${metric.key}`,
          hourLabel: metricIndex === 0 ? formatHourLabel(hour) : '',
          metricLabel: metric.label,
          values,
          total,
          formatter: metric.formatter,
        });
      });
    });

    return generatedRows;
  }, [orders, timeEntries, weekStart, weekEnd, METRICS]);

  if (!rows.length) {
    return (
      <div className="text-center p-6 text-muted">
        No data available for the selected week.
      </div>
    );
  }

  return (
      <div className="overflow-x-auto">
        <table className="table table-hover min-w-full">
          <thead>
            <tr>
              <th>{t('columns.hour')}</th>
              <th>Metric</th>
              {dayHeaders.map(({day, dateLabel}) => (
                <th key={day} className="text-right">
                  <div>{day}</div>
                  <div className="text-xs text-muted">{dateLabel}</div>
                </th>
              ))}
              <th className="text-right">Weekly Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.hourLabel}</td>
                <td>{row.metricLabel}</td>
                {row.values.map((value, index) => (
                  <td key={`${row.id}-${index}`} className="text-right">
                    {row.formatter(value)}
                  </td>
                ))}
                <td className="text-right">{row.formatter(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
}
