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
import { toLuxonDateTime } from "@/lib/datetime.ts";
import {getOrderPaymentTotals} from "@/lib/order.ts";

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

  let weekStart = weekParam ? DateTime.fromISO(weekParam) : DateTime.now();
  if (!weekStart.isValid) {
    weekStart = DateTime.now();
  }
  weekStart = weekStart.startOf('week');
  const weekEnd = weekStart.plus({days: 6});

  return {
    weekStart,
    weekEnd,
    weekStartISO: weekStart.toISODate(),
    weekEndISO: weekEnd.toISODate(),
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
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {weekStart, weekEnd, weekStartISO, weekEndISO} = useMemo(parseWeekParams, []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = {start: weekStartISO, end: weekEndISO};

        const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          WHERE status = 'Paid'
            AND time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $start
            AND time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $end
          FETCH payments, items, items.item, items.item.categories, coupon, coupon.coupon
        `;

        const timeEntriesQuery = `
          SELECT * FROM ${Tables.time_entries}
          WHERE clock_out != NONE
            AND time::format(clock_in, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $end
            AND time::format(clock_out, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $start
        `;

        const [ordersResult, timeEntriesResult]: any = await Promise.all([
          queryRef.current(ordersQuery, params),
          queryRef.current(timeEntriesQuery, params),
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
  }, [weekStartISO, weekEndISO]);

  const dayHeaders = useMemo(() => {
    return WEEK_DAYS.map((day, index) => ({
      day,
      dateLabel: weekStart.plus({days: index}).toFormat('yyyy-LL-dd'),
    }));
  }, [weekStart]);

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
  }, [orders, timeEntries, weekStart, weekEnd]);

  const subtitle = `${weekStartISO} to ${weekEndISO}`;

  if (loading) {
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

  if (!rows.length) {
    return (
      <ReportsLayout title={t('reports.salesHourlyLabourWeekly')} subtitle={subtitle}>
        <div className="text-center p-6 text-gray-500">
          No data available for the selected week.
        </div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('reports.salesHourlyLabourWeekly')}
      subtitle={subtitle}
    >
      <div className="overflow-x-auto">
        <table className="table table-hover min-w-full">
          <thead>
            <tr>
              <th>{t('columns.hour')}</th>
              <th>Metric</th>
              {dayHeaders.map(({day, dateLabel}) => (
                <th key={day} className="text-right">
                  <div>{day}</div>
                  <div className="text-xs text-gray-500">{dateLabel}</div>
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
    </ReportsLayout>
  );
}