import type {TimeEntry} from "@/api/model/time_entry.ts";
import {fetchPayProfiles, fetchTimeEntries} from "@/api/reports/labor/fetch.ts";
import {calculateOrderNetSales} from "@/api/reports/sales/aggregate.ts";
import {fetchPaidOrders} from "@/api/reports/sales/fetch.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {parseHourRangeFromPhrase} from "@/api/reports/shared/filters.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {safeNumber} from "@/lib/utils.ts";

const overlapMinutesInHour = (
  clockIn: Date,
  clockOut: Date,
  hourStart: Date,
  hourEnd: Date,
): number => {
  const start = Math.max(clockIn.getTime(), hourStart.getTime());
  const end = Math.min(clockOut.getTime(), hourEnd.getTime());
  if (end <= start) {
    return 0;
  }
  return (end - start) / 60000;
};

const formatHourLabel = (hour: number): string => {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
};

export const getHourlyLaborVsSales = async (
  db: DbClient,
  options: DateRangeFilter & {
    startHour?: number;
    endHour?: number;
    hourPhrase?: string;
    laborPercentThreshold?: number;
  } = {},
) => {
  let startHour = options.startHour;
  let endHour = options.endHour;
  if (options.hourPhrase) {
    const parsed = parseHourRangeFromPhrase(options.hourPhrase);
    if (parsed) {
      startHour = parsed.startHour;
      endHour = parsed.endHour;
    }
  }

  const laborThreshold = options.laborPercentThreshold ?? 35;

  const [orders, timeEntries, payProfiles] = await Promise.all([
    fetchPaidOrders(db, {
      ...options,
      fetches: ["payments", "payments.payment_type", "items", "items.taxes", "items.tax_mode", "tax", "order_taxes", "order_taxes.tax"],
    }),
    fetchTimeEntries(db, {
      ...options,
      includeOpen: false,
      activeOnly: false,
    }),
    fetchPayProfiles(db, options),
  ]);

  const rateByEmployee = new Map<string, number>();
  payProfiles.forEach(profile => {
    const employeeId = recordIdToString(profile.employee);
    if (employeeId) {
      rateByEmployee.set(employeeId, safeNumber(profile.base_rate));
    }
  });

  const rateByUser = new Map<string, number>();
  timeEntries.forEach(entry => {
    const userId = recordIdToString(entry.user);
    const employeeId = recordIdToString(entry.employee);
    const rate = rateByEmployee.get(employeeId) ?? 0;
    if (userId && rate > 0) {
      rateByUser.set(userId, rate);
    }
  });

  const hours = Array.from({length: 24}, (_, hour) => hour);
  const filteredHours = hours.filter(hour => {
    if (startHour === undefined || endHour === undefined) {
      return true;
    }
    return hour >= startHour && hour < endHour;
  });

  const hourlyRows = filteredHours.map(hour => {
    const hourOrders = orders.filter(order => {
      const orderHour = toJsDate(order.created_at as Parameters<typeof toJsDate>[0]).getHours();
      return orderHour === hour;
    });

    const netSales = hourOrders.reduce((sum, order) => sum + calculateOrderNetSales(order), 0);

    let labourMinutes = 0;
    let laborCost = 0;

    timeEntries.forEach(entry => {
      if (!entry.clock_in || !entry.clock_out) {
        return;
      }
      const clockIn = toJsDate(entry.clock_in as Parameters<typeof toJsDate>[0]);
      const clockOut = toJsDate(entry.clock_out as Parameters<typeof toJsDate>[0]);
      const hourStart = new Date(clockIn);
      hourStart.setHours(hour, 0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hour + 1, 0, 0, 0);

      const minutes = overlapMinutesInHour(clockIn, clockOut, hourStart, hourEnd);
      if (minutes <= 0) {
        return;
      }
      labourMinutes += minutes;
      const userId = recordIdToString(entry.user);
      const rate = rateByUser.get(userId) ?? rateByEmployee.get(recordIdToString(entry.employee)) ?? 0;
      laborCost += (minutes / 60) * rate;
    });

    const laborPercent = netSales > 0 ? safeNumber((laborCost / netSales) * 100) : 0;

    return {
      hour,
      hourLabel: formatHourLabel(hour),
      netSales: safeNumber(netSales),
      laborCost: safeNumber(laborCost),
      laborPercent,
      labourMinutes: Math.round(labourMinutes),
      orderCount: hourOrders.length,
      overStaffed: laborPercent > laborThreshold && netSales > 0,
    };
  });

  const avgLaborPercent = hourlyRows.length > 0
    ? safeNumber(hourlyRows.reduce((s, r) => s + r.laborPercent, 0) / hourlyRows.length)
    : 0;

  const overStaffingWindows = hourlyRows
    .filter(row => row.overStaffed || row.laborPercent > avgLaborPercent * 1.25)
    .sort((a, b) => b.laborPercent - a.laborPercent);

  return {
    note: "Labor cost uses base_rate × hours worked (prorated per clock hour). OT/premiums not included in v1.",
    laborPercentThreshold: laborThreshold,
    avgLaborPercent,
    hours: hourlyRows,
    overStaffingWindows,
    totals: {
      netSales: safeNumber(hourlyRows.reduce((s, r) => s + r.netSales, 0)),
      laborCost: safeNumber(hourlyRows.reduce((s, r) => s + r.laborCost, 0)),
      labourMinutes: hourlyRows.reduce((s, r) => s + r.labourMinutes, 0),
    },
  };
};
