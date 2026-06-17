import {Layout} from "@/screens/partials/layout.tsx";
import {Order as OrderModel, ORDER_FETCHES, OrderStatus} from "@/api/model/order.ts";
import {Tables} from "@/api/db/tables.ts";
import {useCallback, useEffect, useMemo, useState} from "react";
import {DateValue} from "react-aria-components";
import {getLocalTimeZone, today} from "@internationalized/date";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faArrowLeft, faArrowRight, faPrint, faSpinner} from "@fortawesome/free-solid-svg-icons";
import {Calendar} from "@/components/common/antd/calendar.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {DailySalesSummaryReport} from '@/components/summary/daily.sales.summary.report.tsx';
import {useDB} from "@/api/db/db.ts";
import {dispatchPrint} from "@/lib/print.service.ts";
import {PRINT_TYPE} from "@/lib/print.registry.tsx";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {useQueryBuilder} from "@/api/db/query-builder.ts";
import {getOrderFilteredItems} from "@/lib/order.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {TimeEntry} from "@/api/model/time_entry.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {toast} from "sonner";
import ScrollContainer from "react-indiana-drag-scroll";
import {useSecurity} from "@/hooks/useSecurity.ts";
import { toJsDate } from "@/lib/datetime.ts";
import {useTranslation} from "react-i18next";

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIdString = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const obj = value as { id?: unknown; toString?: () => string };
    if (obj.id != null) return String(obj.id);
    if (typeof obj.toString === 'function') return obj.toString();
  }
  return String(value);
};

const getUserDisplayName = (user: unknown, unknownLabel: string): string => {
  if (!user || typeof user !== 'object') return unknownLabel;
  const u = user as { first_name?: string; last_name?: string; name?: string; login?: string };
  const first = (u.first_name || '').trim();
  const last = (u.last_name || '').trim();
  return [first, last].filter(Boolean).join(' ') || u.name || u.login || unknownLabel;
};

const getOrderSale = (order: OrderModel): number => {
  const itemsTotal = (getOrderFilteredItems(order) || []).reduce((sum, item) => {
    return sum + safeNumber(calculateOrderItemPrice(item));
  }, 0);
  const extrasTotal = (order.extras || []).reduce((sum, extra) => sum + safeNumber(extra.value), 0);
  const taxAmount = safeNumber(order.tax_amount);
  const serviceAmount = safeNumber(order.service_charge_amount);
  const discountAmount = safeNumber(order.discount_amount);
  return safeNumber(itemsTotal + extrasTotal + taxAmount + serviceAmount - discountAmount);
};

const formatDuration = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const Summary = () => {
  const {t} = useTranslation(["summary", "toast"]);
  const db = useDB();
  const [page] = useAtom(appPage);
  const {protectAction} = useSecurity();

  const [date, setDate] = useState<DateValue>(today(getLocalTimeZone()));
  const [orders, setOrders] = useState<OrderModel[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [isPrintingMix, setIsPrintingMix] = useState(false);
  const [isPrintingServerSales, setIsPrintingServerSales] = useState(false);

  const orderFilters = useMemo(() => {
    const f = [`status = '${OrderStatus.Paid}'`];

    if (date) {
      f.push(`(time::format(created_at, "%Y-%m-%d") = "${date?.toString()}")`);
    }

    return f;
  }, [date]);

  const ordersQb = useQueryBuilder(
    Tables.orders, '*', orderFilters.map(item => `and ${item}`), 99999, 0, ['created_at desc'],
    ORDER_FETCHES
  );

  useEffect(() => {
    ordersQb.setWheres(orderFilters.map(item => `and ${item}`));
  }, [orderFilters]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const [listQuery] = await db.query(ordersQb.queryString, ordersQb.parameters);

    setOrders(listQuery as OrderModel[]);
    setLoading(false);
  }, [ordersQb.queryString, ordersQb.parameters]);

  useEffect(() => {
    fetchOrders();
  }, [ordersQb.queryString, ordersQb.parameters]);

  const handlePrintSummary = useCallback(() => {
    void dispatchPrint(db, PRINT_TYPE.summary, {
      orders,
      date: date.toString(),
    }, {userId: page?.user?.id});
  }, [db, orders, date, page?.user?.id]);

  const handlePrintProductMix = useCallback(async () => {
    setIsPrintingMix(true);
    try {
      const dishMap = new Map<string, { name: string; qty: number; total: number }>();

      (orders || []).forEach((order) => {
        (getOrderFilteredItems(order) || []).forEach((item) => {
          const name = item?.item?.name || 'Unknown Item';
          const qty = safeNumber(item?.quantity);
          const total = safeNumber(calculateOrderItemPrice(item));
          const key = String(item.item.name);
          const prev = dishMap.get(key) || {name: key.substring(0, 12), qty: 0, total: 0};
          prev.qty += qty;
          prev.total += total;

          dishMap.set(key, prev);
        });
      });

      const rows = Array.from(dishMap.values())
        .sort((a, b) => b.total - a.total);

      const totalSale = rows.reduce((sum, row) => sum + row.total, 0);
      if (rows.length === 0) {
        toast.error(t("toast:summary.noProductMix"));
        return;
      }

      const tableRows: Array<Array<Record<string, unknown>>> = [
        [{text: `PRODUCT MIX REPORT (${date.toString()})`, align: 'CENTER', width: 1, style: 'B'}],
        [{text: 'Item', align: 'LEFT', width: 0.30, style: 'B'}, {
          text: 'Qty',
          align: 'RIGHT',
          width: 0.18,
          style: 'B'
        }, {text: 'Ttl', align: 'RIGHT', width: 0.23, style: 'B'}, {
          text: '%',
          align: 'RIGHT',
          width: 0.23,
          style: 'B'
        }],
        ...rows.map((row) => {
          const percent = totalSale > 0 ? (row.total / totalSale) * 100 : 0;
          return [
            {text: row.name, align: 'LEFT', width: 0.30},
            {text: String(formatNumber(row.qty)), align: 'RIGHT', width: 0.18},
            {text: formatNumber(row.total), align: 'RIGHT', width: 0.23},
            {text: `${percent.toFixed(2)}%`, align: 'RIGHT', width: 0.23},
          ];
        }),
        [{
          text: 'TOTAL',
          align: 'LEFT',
          width: 0.50,
          style: 'B'
        }, {text: withCurrency(undefined) + formatNumber(totalSale), align: 'RIGHT', width: 0.50, style: 'B'}],
      ];

      void dispatchPrint(db, PRINT_TYPE.summary, {
        printType: 'table',
        rows: tableRows,
        cut: true,
      }, {userId: page?.user?.id});
    } finally {
      setIsPrintingMix(false);
    }
  }, [db, date, orders, page?.user?.id]);

  const handlePrintServerSales = useCallback(async () => {
    setIsPrintingServerSales(true);
    try {

      const reportDate = date.toString();
      const [entryRes] = await db.query(
        `SELECT *
         FROM ${Tables.time_entries}
         WHERE clock_out != NONE
           AND time::format(clock_in, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") = $date
           AND time::format(clock_out
             , "${import.meta.env.VITE_DB_DATABASE_FORMAT}") = $date
             FETCH user`,
        {date: reportDate}
      );

      const entries = (Array.isArray(entryRes) ? entryRes : []) as TimeEntry[];
      if (entries.length === 0) {
        toast.error(t("toast:summary.noTimeEntries"));
        return;
      }

      const perUser = new Map<string, {
        name: string;
        durationMs: number;
        guests: number;
        checks: number;
        sales: number
      }>();
      entries.forEach((entry) => {
        const userId = toIdString(entry.user);
        if (!userId) return;
        const current = perUser.get(userId) || {
          name: getUserDisplayName(entry.user, t("summary:unknown.user")).substring(0, 12),
          durationMs: 0,
          guests: 0,
          checks: 0,
          sales: 0,
        };
        const inAt = entry.clock_in ? toJsDate(entry.clock_in).getTime() : 0;
        const outAt = entry.clock_out ? toJsDate(entry.clock_out).getTime() : 0;
        if (inAt > 0 && outAt > inAt) current.durationMs += (outAt - inAt);
        perUser.set(userId, current);
      });

      (orders || []).forEach((order) => {
        const userId = toIdString(order.user);
        const row = perUser.get(userId);
        if (!row) return;
        row.checks += 1;
        row.guests += safeNumber(order.covers);
        row.sales += getOrderSale(order);
      });

      const rows = Array.from(perUser.values()).sort((a, b) => b.sales - a.sales);
      if (rows.length === 0) {
        toast.error(t("toast:summary.noServerSales"));
        return;
      }

      const totals = rows.reduce((acc, row) => ({
        durationMs: acc.durationMs + row.durationMs,
        guests: acc.guests + row.guests,
        checks: acc.checks + row.checks,
        sales: acc.sales + row.sales,
      }), {durationMs: 0, guests: 0, checks: 0, sales: 0});

      const tableRows: Array<Array<Record<string, unknown>>> = [
        [{text: `SERVER SALES (${reportDate})`, align: 'CENTER', width: 1, style: 'B'}],
        [{text: 'Name', align: 'LEFT', width: 0.22, style: 'B'}, {
          text: 'Time',
          align: 'RIGHT',
          width: 0.20,
          style: 'B'
        }, {text: 'Gsts', align: 'RIGHT', width: 0.12, style: 'B'}, {
          text: 'Chks',
          align: 'RIGHT',
          width: 0.12,
          style: 'B'
        }, {text: 'Sale', align: 'RIGHT', width: 0.22, style: 'B'}],
        ...rows.map((row) => ([
          {text: row.name, align: 'LEFT', width: 0.22},
          {text: formatDuration(row.durationMs), align: 'RIGHT', width: 0.20},
          {text: String(Math.round(row.guests)), align: 'RIGHT', width: 0.12},
          {text: String(Math.round(row.checks)), align: 'RIGHT', width: 0.12},
          {text: formatNumber(row.sales), align: 'RIGHT', width: 0.22},
        ])),
        [{text: 'TOTAL', align: 'LEFT', width: 0.22, style: 'B'}, {
          text: formatDuration(totals.durationMs),
          align: 'RIGHT',
          width: 0.20,
          style: 'B'
        }, {
          text: String(Math.round(totals.guests)),
          align: 'RIGHT',
          width: 0.12,
          style: 'B'
        }, {
          text: String(Math.round(totals.checks)),
          align: 'RIGHT',
          width: 0.12,
          style: 'B'
        }, {text: withCurrency(undefined) + formatNumber(totals.sales), align: 'RIGHT', width: 0.22, style: 'B'}],
      ];

      void dispatchPrint(db, PRINT_TYPE.summary, {
        printType: 'table',
        rows: tableRows,
        cut: true,
      }, {userId: page?.user?.id});
    } finally {
      setIsPrintingServerSales(false);
    }
  }, [db, date, orders, page?.user?.id]);

  return (
    <Layout overflowHidden>
      <div className="flex gap-5 p-3 flex-col">
        <div className="bg-white rounded-xl flex gap-10 justify-center px-5">
          <div className="flex justify-center items-center flex-col flex-1">
            <div className="w-[450px]">
              <Calendar
                onChange={setDate}
                value={date}
                maxValue={today(getLocalTimeZone())}
              />
            </div>
            <div className="flex gap-3 mt-3">
              <Button
                icon={faArrowLeft} size="lg" variant="primary" filled
                onClick={() => {
                  setDate(prevState => {
                    return prevState.subtract({
                      days: 1
                    })
                  })
                }}
              >
                {t("summary:screen.previousDate")}</Button>
              <Button
                rightIcon={faArrowRight} size="lg" variant="primary" filled
                onClick={() => {
                  setDate(prevState => {
                    return prevState.add({
                      days: 1
                    })
                  })
                }}
              >
                {t("summary:screen.nextDate")}</Button>
            </div>
            <div className="flex gap-3 mt-3 flex-wrap">
              <Button
                icon={faPrint}
                variant="lg"
                onClick={() => {
                  protectAction(handlePrintSummary, {
                    description: t("summary:security.printSummaryDescription"),
                    module: 'Print summary',
                  });
                }}
              >{t("summary:screen.printSummary")}</Button>
              <Button
                icon={faPrint}
                variant="lg"
                isLoading={isPrintingMix}
                onClick={() => {
                  protectAction(handlePrintProductMix, {
                    description: t("summary:security.productMixDescription"),
                    module: 'Product mix report',
                  });
                }}
              >
                {t("summary:screen.productMixReport")}
              </Button>
              <Button
                icon={faPrint}
                variant="lg"
                isLoading={isPrintingServerSales}
                onClick={() => {
                  protectAction(handlePrintServerSales, {
                    description: t("summary:security.serverSalesDescription"),
                    module: 'Server sales',
                  });
                }}
              >
                {t("summary:screen.serverSales")}
              </Button>
            </div>
          </div>
          <ScrollContainer className="max-h-[calc(100vh_-_30px)] overflow-y-auto flex-1 flex-basis-[500px] py-10 select-none">
            {isLoading ? (
              <div className="flex h-screen w-full justify-center items-center flex-1">
                <FontAwesomeIcon icon={faSpinner} spin size="5x"/>
              </div>
            ) : (
              <>
                <DailySalesSummaryReport orders={orders} date={date.toString()} />
              </>
            )}
          </ScrollContainer>
        </div>
      </div>
    </Layout>
  );
}
