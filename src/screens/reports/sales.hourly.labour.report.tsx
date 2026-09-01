import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {useEffect, useState, useMemo, useRef} from "react";
import { useTranslation } from 'react-i18next';
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {TimeEntry} from "@/api/model/time_entry.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {calculateOrderTotal} from "@/lib/cart.ts";
import { toJsDate } from "@/lib/datetime.ts";
import {getOrderPaymentTotals} from "@/lib/order.ts";

interface HourlyData {
  hour: number;
  startTime: string;
  amountCollected: number;
  grossSale: number;
  couponAmount: number;
  guests: number;
  guestAvg: number;
  checks: number;
  checkAvg: number;
  labourHours: number; // in minutes
}

export const SalesHourlyLabourReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  const params = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const startDate = urlParams.get('start');
    const endDate = urlParams.get('end');
    const hoursParam = urlParams.getAll('hours[]').filter(h => h && h.trim() !== '');
    return {startDate, endDate, hours: hoursParam};
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Build orders query with optional date filter
        const orderConditions: string[] = ["status = 'Paid'"];
        const orderParams: Record<string, string> = {};

        if (params.startDate && params.endDate) {
          orderConditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          orderConditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          orderParams.startDate = params.startDate;
          orderParams.endDate = params.endDate;
        }

        const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          WHERE ${orderConditions.join(' AND ')}
          FETCH payments, payments.payment_type, items, coupon, coupon.coupon
        `;

        const ordersResult: any = await queryRef.current(ordersQuery, orderParams);
        const fetchedOrders = (ordersResult[0] || []) as Order[];
        setOrders(fetchedOrders);

        // Build time entries query with optional date filter
        const timeEntryConditions: string[] = ["clock_out != NONE"];
        const timeEntryParams: Record<string, string> = {};

        if (params.startDate && params.endDate) {
          timeEntryConditions.push(`time::format(clock_in, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          timeEntryConditions.push(`time::format(clock_in, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          timeEntryParams.startDate = params.startDate;
          timeEntryParams.endDate = params.endDate;
        }

        const timeEntriesQuery = `
          SELECT * FROM ${Tables.time_entries}
          WHERE ${timeEntryConditions.join(' AND ')}
          FETCH user
        `;

        const timeEntriesResult: any = await queryRef.current(timeEntriesQuery, timeEntryParams);
        const fetchedTimeEntries = (timeEntriesResult[0] || []) as TimeEntry[];
        setTimeEntries(fetchedTimeEntries);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
        console.error('Error fetching report data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params.startDate, params.endDate]);

  const hourlyData = useMemo(() => {
    const data: HourlyData[] = [];
    
    // Generate hours from 1am to 12am (1-24)
    for (let hour = 1; hour <= 24; hour++) {
      // Skip hours if filter is applied and this hour is not in the filter
      if (params.hours.length > 0 && !params.hours.includes(String(hour - 1))) {
        continue;
      }

      const hourStart = hour === 24 ? 0 : hour;
      const hourEnd = hour === 24 ? 1 : hour + 1;
      
      // Format start time (1am, 2am, etc.)
      const startTime = hourStart === 0 ? '12am' : 
                       hourStart === 12 ? '12pm' :
                       hourStart < 12 ? `${hourStart}am` : `${hourStart - 12}pm`;

      // Filter orders for this hour
      const hourOrders = orders.filter(order => {
        const orderDate = toJsDate(order.created_at);
        const orderHour = orderDate.getHours();
        // Handle 24-hour format: 1am = 1, 2am = 2, ..., 11pm = 23, 12am = 0
        if (hour === 24) {
          return orderHour === 0;
        }
        return orderHour === hourStart;
      });

      // Calculate metrics with proper number validation
      const amountCollected = hourOrders.reduce((sum, order) => {
        const paymentsTotal = getOrderPaymentTotals(order).amountCollected;
        return sum + (isNaN(paymentsTotal) ? 0 : paymentsTotal);
      }, 0);

      const grossSale = hourOrders.reduce((sum, order) => {
        const orderTotal = calculateOrderTotal(order) || 0;
        const total = Number(orderTotal);
        return sum + (isNaN(total) ? 0 : total);
      }, 0);
      const couponAmount = hourOrders.reduce((sum, order) => {
        const coupon = Number(order.coupon?.discount) || 0;
        return sum + (isNaN(coupon) ? 0 : coupon);
      }, 0);

      const guests = hourOrders.reduce((sum, order) => {
        const covers = Number(order.covers) || 0;
        return sum + (isNaN(covers) ? 0 : covers);
      }, 0);

      const checks = hourOrders.length;

      const guestAvg = guests > 0 && !isNaN(grossSale) && !isNaN(guests) 
        ? grossSale / guests 
        : 0;
      const checkAvg = checks > 0 && !isNaN(grossSale) && !isNaN(checks)
        ? grossSale / checks 
        : 0;

      // Calculate labour hours for this hour
      const labourMinutes = timeEntries.reduce((sum, entry) => {
        if (!entry.clock_in || !entry.clock_out) return sum;
        
        const clockIn = toJsDate(entry.clock_in);
        const clockOut = toJsDate(entry.clock_out);
        
        // Determine the hour range for this report hour (1am = 1, 12am = 0)
        const reportHour = hour === 24 ? 0 : hourStart;
        const nextHour = hour === 24 ? 1 : hourEnd;
        
        // Set hour boundaries based on the clock_in date
        const hourStartTime = toJsDate(clockIn.getTime());
        hourStartTime.setHours(reportHour, 0, 0, 0);
        const hourEndTime = toJsDate(clockIn.getTime());
        hourEndTime.setHours(nextHour, 0, 0, 0);
        
        // Check if time entry overlaps with this hour
        if (clockOut > hourStartTime && clockIn < hourEndTime) {
          // Calculate overlap
          const overlapStart = clockIn > hourStartTime ? clockIn : hourStartTime;
          const overlapEnd = clockOut < hourEndTime ? clockOut : hourEndTime;
          
          if (overlapEnd > overlapStart) {
            const minutes = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 1000 / 60);
            return sum + minutes;
          }
        }
        
        return sum;
      }, 0);

      data.push({
        hour: hourStart,
        startTime,
        amountCollected: isNaN(amountCollected) ? 0 : amountCollected,
        grossSale: isNaN(grossSale) ? 0 : grossSale,
        couponAmount: isNaN(couponAmount) ? 0 : couponAmount,
        guests: isNaN(guests) ? 0 : guests,
        guestAvg: isNaN(guestAvg) ? 0 : guestAvg,
        checks: isNaN(checks) ? 0 : checks,
        checkAvg: isNaN(checkAvg) ? 0 : checkAvg,
        labourHours: isNaN(labourMinutes) ? 0 : labourMinutes
      });
    }

    return data;
  }, [orders, timeEntries, params.hours]);

  const totals = useMemo(() => {
    return hourlyData.reduce((acc, row) => {
      const amountCollected = Number(row.amountCollected) || 0;
      const grossSale = Number(row.grossSale) || 0;
      const couponAmount = Number(row.couponAmount) || 0;
      const guests = Number(row.guests) || 0;
      const checks = Number(row.checks) || 0;
      const labourHours = Number(row.labourHours) || 0;

      return {
        amountCollected: acc.amountCollected + (isNaN(amountCollected) ? 0 : amountCollected),
        grossSale: acc.grossSale + (isNaN(grossSale) ? 0 : grossSale),
        couponAmount: acc.couponAmount + (isNaN(couponAmount) ? 0 : couponAmount),
        guests: acc.guests + (isNaN(guests) ? 0 : guests),
        checks: acc.checks + (isNaN(checks) ? 0 : checks),
        labourHours: acc.labourHours + (isNaN(labourHours) ? 0 : labourHours)
      };
    }, {
      amountCollected: 0,
      grossSale: 0,
      couponAmount: 0,
      guests: 0,
      checks: 0,
      labourHours: 0
    });
  }, [hourlyData]);

  const totalGuestAvg = totals.guests > 0 && !isNaN(totals.grossSale) && !isNaN(totals.guests)
    ? totals.grossSale / totals.guests 
    : 0;
  const totalCheckAvg = totals.checks > 0 && !isNaN(totals.grossSale) && !isNaN(totals.checks)
    ? totals.grossSale / totals.checks 
    : 0;

  const subtitle = params.startDate && params.endDate 
    ? `${params.startDate} to ${params.endDate}`
    : undefined;

  if (loading) {
    return (
      <ReportsLayout title={t('reports.salesHourlyLabour')} subtitle={subtitle}>
        <div className="text-center p-8">{t('common:actions.loading')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('reports.salesHourlyLabour')} subtitle={subtitle}>
        <div className="text-center p-8 text-red-600">Error: {error}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('reports.salesHourlyLabour')}
      subtitle={subtitle}
    >
      <table className="table table-hover">
        <thead>
          <tr>
            <th>Start Time</th>
            <th className="text-right">{t('labels.amountCollected')}</th>
            <th className="text-right">{t('labels.grossSale')}</th>
            <th className="text-right">{t('metrics.couponAmount')}</th>
            <th className="text-right">{t('columns.guests')}</th>
            <th className="text-right">{t('labels.guestAvg')}</th>
            <th className="text-right">{t('columns.checks')}</th>
            <th className="text-right">{t('metrics.checkAvg')}</th>
            <th className="text-right">{t('metrics.labourHoursMins')}</th>
          </tr>
        </thead>
        <tbody>
          {hourlyData.map((row, index) => (
            <tr key={index}>
              <td>{row.startTime}</td>
              <td className="text-right">{withCurrency(row.amountCollected)}</td>
              <td className="text-right">{withCurrency(row.grossSale)}</td>
              <td className="text-right">{withCurrency(row.couponAmount)}</td>
              <td className="text-right">{formatNumber(row.guests)}</td>
              <td className="text-right">{withCurrency(row.guestAvg)}</td>
              <td className="text-right">{formatNumber(row.checks)}</td>
              <td className="text-right">{withCurrency(row.checkAvg)}</td>
              <td className="text-right">{formatNumber(row.labourHours)}</td>
            </tr>
          ))}
          {hourlyData.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center p-8 text-gray-500">
                No data available for the selected date range
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td>Totals</td>
            <td className="text-right">{withCurrency(totals.amountCollected)}</td>
            <td className="text-right">{withCurrency(totals.grossSale)}</td>
            <td className="text-right">{withCurrency(totals.couponAmount)}</td>
            <td className="text-right">{formatNumber(totals.guests)}</td>
            <td className="text-right">{withCurrency(totalGuestAvg)}</td>
            <td className="text-right">{formatNumber(totals.checks)}</td>
            <td className="text-right">{withCurrency(totalCheckAvg)}</td>
            <td className="text-right">{formatNumber(totals.labourHours)}</td>
          </tr>
        </tfoot>
      </table>
    </ReportsLayout>
  );
}