import {Layout} from "@/screens/partials/layout.tsx";
import {Order as OrderModel, ORDER_FETCHES, OrderStatus} from "@/api/model/order.ts";
import {Tables} from "@/api/db/tables.ts";
import {useCallback, useEffect, useMemo, useRef, useState, useTransition} from "react";
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
import {getOrderTaxAmount} from "@/lib/tax-calculator.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {toast} from "sonner";
import ScrollContainer from "react-indiana-drag-scroll";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {
  type ClosingCycleConfig,
  loadClosingCycleConfig,
} from "@/lib/closing-cycle.ts";
import { formatBusinessDateWindow, resolveReportDayWindow } from "@/lib/kitchen/business-date.ts";
import {useTranslation} from "react-i18next";
import {DocumentTitle} from "@/components/common/document-title.tsx";

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
  const extrasTotal = (order.extras || []).reduce((sum, extra) => sum + safeNumber(extra?.value), 0);
  const taxAmount = getOrderTaxAmount(order);
  const serviceAmount = safeNumber(order.service_charge_amount);
  const discountAmount = safeNumber(order.discount_amount);
  return safeNumber(itemsTotal + extrasTotal + taxAmount + serviceAmount - discountAmount);
};

export const Summary = () => {
  const {t} = useTranslation(["summary", "toast"]);
  const {t: tNav} = useTranslation('navigation');
  const db = useDB();
  const [page] = useAtom(appPage);
  const {protectAction} = useSecurity();

  const [date, setDate] = useState<DateValue>(today(getLocalTimeZone()));
  const [orders, setOrders] = useState<OrderModel[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [isReportPending, startReportTransition] = useTransition();
  const fetchGenerationRef = useRef(0);
  const [isPrintingMix, setIsPrintingMix] = useState(false);
  const [isPrintingServerSales, setIsPrintingServerSales] = useState(false);
  const [cycleConfig, setCycleConfig] = useState<ClosingCycleConfig | null>(null);
  const [cycleConfigReady, setCycleConfigReady] = useState(false);

  /** Hide stale figures as soon as the selected business day changes. */
  const selectDate = useCallback((next: DateValue | ((prev: DateValue) => DateValue)) => {
    setLoading(true);
    setOrders([]);
    setDate(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {config} = await loadClosingCycleConfig(db);
        if (!cancelled) setCycleConfig(config);
      } catch (error) {
        console.warn('Failed to load closing cycle for summary', error);
        if (!cancelled) setCycleConfig(null);
      } finally {
        if (!cancelled) setCycleConfigReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reportWindow = useMemo(() => {
    if (!date) return null;
    return resolveReportDayWindow(cycleConfig, date.toString());
  }, [date, cycleConfig]);

  const reportWindowLabel = useMemo(() => {
    if (!reportWindow) return null;
    return formatBusinessDateWindow(reportWindow);
  }, [reportWindow]);

  const orderFilters = useMemo(() => {
    const f = [`status = '${OrderStatus.Paid}'`];

    if (reportWindow) {
      const startIso = reportWindow.date_from.toISOString();
      const endIso = reportWindow.date_to.toISOString();
      if ('exclusiveEnd' in reportWindow && reportWindow.exclusiveEnd) {
        f.push(`(created_at >= <datetime>"${startIso}" AND created_at < <datetime>"${endIso}")`);
      } else {
        f.push(`(created_at >= <datetime>"${startIso}" AND created_at <= <datetime>"${endIso}")`);
      }
    }

    return f;
  }, [reportWindow]);

  const ordersQb = useQueryBuilder(
    Tables.orders, '*', orderFilters.map(item => `and ${item}`), 99999, 0, ['created_at desc'],
    ORDER_FETCHES
  );

  useEffect(() => {
    ordersQb.setWheres(orderFilters.map(item => `and ${item}`));
  }, [orderFilters]);

  const fetchOrders = useCallback(async () => {
    if (!cycleConfigReady || !reportWindow) {
      return;
    }
    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    try {
      const [listQuery] = await db.query(ordersQb.queryString, ordersQb.parameters);
      if (generation !== fetchGenerationRef.current) {
        return;
      }
      // Keep the spinner up through the heavy DailySalesSummaryReport commit.
      startReportTransition(() => {
        setOrders(listQuery as OrderModel[]);
        setLoading(false);
      });
    } catch (error) {
      if (generation !== fetchGenerationRef.current) {
        return;
      }
      console.warn('Failed to load summary orders', error);
      startReportTransition(() => {
        setOrders([]);
        setLoading(false);
      });
    }
  }, [cycleConfigReady, reportWindow, ordersQb.queryString, ordersQb.parameters]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const showReportLoading = isLoading || isReportPending;

  const handlePrintSummary = useCallback(() => {
    void dispatchPrint(db, PRINT_TYPE.summary, {
      orders,
      date: date.toString(),
      windowRange: reportWindowLabel ?? undefined,
    }, {userId: page?.user?.id});
  }, [db, orders, date, page?.user?.id, reportWindowLabel]);

  const handlePrintMinimalSummary = useCallback(() => {
    void dispatchPrint(db, PRINT_TYPE.summary, {
      orders,
      date: date.toString(),
      windowRange: reportWindowLabel ?? undefined,
      variant: 'minimal',
    }, {userId: page?.user?.id});
  }, [db, orders, date, page?.user?.id, reportWindowLabel]);

  const handlePrintProductMix = useCallback(() => {
    setIsPrintingMix(true);
    try {
      void dispatchPrint(db, PRINT_TYPE.summary, {
        orders,
        date: date.toString(),
        windowRange: reportWindowLabel ?? undefined,
        variant: 'product_mix',
      }, {userId: page?.user?.id});
    } finally {
      setIsPrintingMix(false);
    }
  }, [db, orders, date, page?.user?.id, reportWindowLabel]);

  const handlePrintServerSales = useCallback(async () => {
    setIsPrintingServerSales(true);
    try {
      // Same closing-cycle order set as the Summary report (no attendance filter).
      if (!reportWindow || !orders?.length) {
        toast.error(t("toast:summary.noServerSales"));
        return;
      }

      const reportDate = date.toString();
      type ServerRow = {
        name: string;
        guests: number;
        checks: number;
        sales: number;
      };
      const perUser = new Map<string, ServerRow>();
      const unknownUser = t("summary:unknown.user");

      orders.forEach((order) => {
        const userId = toIdString(order.user) || 'unknown';
        const current = perUser.get(userId) || {
          name: getUserDisplayName(order.user, unknownUser).substring(0, 16),
          guests: 0,
          checks: 0,
          sales: 0,
        };
        current.checks += 1;
        current.guests += safeNumber(order.covers);
        current.sales += getOrderSale(order);
        perUser.set(userId, current);
      });

      const rows = Array.from(perUser.values()).sort((a, b) => b.sales - a.sales);
      if (rows.length === 0) {
        toast.error(t("toast:summary.noServerSales"));
        return;
      }

      const totals = rows.reduce((acc, row) => ({
        guests: acc.guests + row.guests,
        checks: acc.checks + row.checks,
        sales: acc.sales + row.sales,
      }), {guests: 0, checks: 0, sales: 0});

      const title = reportWindowLabel
        ? `SERVER SALES (${reportWindowLabel})`
        : `SERVER SALES (${reportDate})`;

      const tableRows: Array<Array<Record<string, unknown>>> = [
        [{text: title, align: 'CENTER', width: 1, style: 'B'}],
        [
          {text: 'Name', align: 'LEFT', width: 0.40, style: 'B'},
          {text: 'Gsts', align: 'RIGHT', width: 0.15, style: 'B'},
          {text: 'Chks', align: 'RIGHT', width: 0.15, style: 'B'},
          {text: 'Sale', align: 'RIGHT', width: 0.30, style: 'B'},
        ],
        ...rows.map((row) => ([
          {text: row.name, align: 'LEFT', width: 0.40},
          {text: String(Math.round(row.guests)), align: 'RIGHT', width: 0.15},
          {text: String(Math.round(row.checks)), align: 'RIGHT', width: 0.15},
          {text: formatNumber(row.sales), align: 'RIGHT', width: 0.30},
        ])),
        [
          {text: 'TOTAL', align: 'LEFT', width: 0.40, style: 'B'},
          {text: String(Math.round(totals.guests)), align: 'RIGHT', width: 0.15, style: 'B'},
          {text: String(Math.round(totals.checks)), align: 'RIGHT', width: 0.15, style: 'B'},
          {text: withCurrency(undefined) + formatNumber(totals.sales), align: 'RIGHT', width: 0.30, style: 'B'},
        ],
      ];

      void dispatchPrint(db, PRINT_TYPE.summary, {
        printType: 'table',
        rows: tableRows,
        cut: true,
      }, {userId: page?.user?.id});
    } finally {
      setIsPrintingServerSales(false);
    }
  }, [db, date, orders, page?.user?.id, reportWindow, reportWindowLabel, t]);

  return (
    <Layout overflowHidden>
      <DocumentTitle parts={[tNav('sidebar.summary')]} />
      <div className="flex gap-5 p-3 flex-col" data-testid="summary-page">
        <div className="bg-surface-elevated rounded-xl flex gap-10 justify-center px-5">
          <div className="flex justify-center items-center flex-col flex-1">
            <div className="w-[450px]" data-testid="summary-calendar">
              <Calendar
                onChange={selectDate}
                value={date}
                maxValue={today(getLocalTimeZone())}
              />
            </div>
            <div className="flex gap-3 mt-3">
              <Button
                icon={faArrowLeft} size="lg" variant="primary" filled
                onClick={() => {
                  selectDate(prevState => prevState.subtract({days: 1}));
                }}
              >
                {t("summary:screen.previousDate")}</Button>
              <Button
                rightIcon={faArrowRight} size="lg" variant="primary" filled
                onClick={() => {
                  selectDate(prevState => prevState.add({days: 1}));
                }}
              >
                {t("summary:screen.nextDate")}</Button>
            </div>
            <div className="flex gap-3 mt-3 flex-wrap" data-testid="summary-print-actions">
              <Button
                icon={faPrint}
                variant="lg"
                onClick={() => {
                  protectAction(handlePrintSummary, {
                    description: t("summary:security.printSummaryDescription"),
                    module: 'summary.print',
                  });
                }}
              >{t("summary:screen.printSummary")}</Button>
              <Button
                icon={faPrint}
                variant="lg"
                onClick={() => {
                  protectAction(handlePrintMinimalSummary, {
                    description: t("summary:security.printMinimalSummaryDescription"),
                    module: 'summary.print',
                  });
                }}
              >{t("summary:screen.printMinimalSummary")}</Button>
              <Button
                icon={faPrint}
                variant="lg"
                isLoading={isPrintingMix}
                onClick={() => {
                  protectAction(handlePrintProductMix, {
                    description: t("summary:security.productMixDescription"),
                    module: 'summary.product_mix',
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
                    module: 'summary.server_sales',
                  });
                }}
              >
                {t("summary:screen.serverSales")}
              </Button>
            </div>
          </div>
          <ScrollContainer className="max-h-[calc(100vh_-_30px_-_var(--app-toolbar-h))] overflow-y-auto flex-1 flex-basis-[500px] py-10 select-none" data-testid="summary-report">
            {showReportLoading ? (
              <div
                className="flex h-screen w-full justify-center items-center flex-1 flex-col gap-4"
                data-testid="summary-report-loading"
                aria-busy="true"
              >
                <FontAwesomeIcon icon={faSpinner} spin size="5x"/>
                <p className="text-sm text-muted">{t("summary:screen.loadingSaleData")}</p>
              </div>
            ) : (
              <DailySalesSummaryReport
                orders={orders}
                date={date.toString()}
                windowRange={reportWindowLabel}
              />
            )}
          </ScrollContainer>
        </div>
      </div>
    </Layout>
  );
}
