import { Layout } from "@/screens/partials/layout.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { useState, useEffect, useMemo } from "react";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { LOGIN } from "@/routes/posr.ts";
import { Countdown } from "@/components/floor/countdown.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faClock, faUser } from "@fortawesome/free-solid-svg-icons";
import { TimeEntry } from "@/api/model/time_entry.ts";
import { StringRecordId } from "surrealdb";
import { Order, OrderStatus } from "@/api/model/order.ts";
import { calculateOrderItemPrice } from "@/lib/cart.ts";
import { getOrderFilteredItems } from "@/lib/order.ts";
import { toRecordId, withCurrency } from "@/lib/utils.ts";
import type { UserShift } from "@/api/model/user.ts";
import { nowSurrealDateTime, toJsDate, toLuxonDateTime } from "@/lib/datetime.ts";
import {useTranslation} from "react-i18next";

const formatShiftClock = (time: string) => {
  const trimmed = time.trim();
  const iso = trimmed.includes('T') ? trimmed : `1970-01-01T${trimmed}`;
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? dt.toFormat('h:mm a') : trimmed;
};

export const Clock = () => {
  const {t} = useTranslation(["summary", "toast"]);
  const [page, setPage] = useAtom(appPage);
  const db = useDB();
  const navigation = useNavigate();
  const [timeEntry, setTimeEntry] = useState<TimeEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [resolvedShift, setResolvedShift] = useState<UserShift | null>(null);

  const loadTimeEntry = async () => {
    if (!page.user) {
      navigation(LOGIN);
      return;
    }

    try {
      const timeEntryCheck: any = await db.query(`SELECT * from ${Tables.time_entries} where user = $userId and clock_out = NONE`, {
        userId: new StringRecordId(page.user.id),
      });

      if (timeEntryCheck[0].length > 0) {
        setTimeEntry(timeEntryCheck[0][0]);
      } else {
        toast.error(t("toast:clock.noActiveEntry"));
        navigation(LOGIN);
      }
    } catch (error) {
      toast.error(t("toast:clock.loadEntryFailed"));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTimeEntry();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadShift = async () => {
      const u = page.user;
      if (!u) {
        setResolvedShift(null);
        return;
      }

      const raw = u.user_shift;
      if (raw && typeof raw === 'object' && 'name' in raw && typeof (raw as UserShift).name === 'string') {
        if (!cancelled) setResolvedShift(raw as UserShift);
        return;
      }

      const shiftId =
        typeof raw === 'string'
          ? raw
          : raw && typeof raw === 'object' && 'id' in raw
            ? String((raw as { id: unknown }).id)
            : undefined;

      if (!shiftId) {
        if (!cancelled) setResolvedShift(null);
        return;
      }

      try {
        const result = await db.query(`SELECT * FROM ${Tables.shifts} WHERE id = $shiftId AND deleted_at = none LIMIT 1`, {
          shiftId: toRecordId(shiftId),
        });
        const rows = result[0] as UserShift[] | undefined;
        const row = Array.isArray(rows) ? rows[0] : undefined;
        if (!cancelled) setResolvedShift(row ?? null);
      } catch {
        if (!cancelled) setResolvedShift(null);
      }
    };

    void loadShift();
    return () => {
      cancelled = true;
    };
  }, [page.user, db]);

  const loadOrders = async () => {
    if (!timeEntry || !page.user) return;

    try {
      setOrdersLoading(true);
      const clockInTime = timeEntry.clock_in;
      // const clockInISO = clockInTime.toISOString();

      const ordersQuery = `
        SELECT * FROM ${Tables.orders}
        WHERE user = $userId
          AND created_at >= $clockInTime
          AND created_at <= time::now()
        FETCH items, items.item, items.modifiers, payments, payments.payment_type, discount, tax, extras
      `;

      const result: any = await db.query(ordersQuery, {
        userId: new StringRecordId(page.user.id),
        clockInTime: clockInTime,
      });

      setOrders((result?.[0] ?? []) as Order[]);
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast.error(t("toast:clock.loadSaleSummaryFailed"));
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (timeEntry) {
      loadOrders();
      // Refresh orders every 30 seconds
      // const interval = setInterval(loadOrders, 30000);
      // return () => clearInterval(interval);
    }
  }, [timeEntry]);

  // Calculate sale metrics - must be before any conditional returns
  const safeNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const salePriceWithoutTax = useMemo(() => {
    return safeNumber(
      orders?.filter(order => order.status === OrderStatus.Paid).reduce((sum, order) => {
        const itemsTotal = safeNumber(
          order.items?.reduce((itemSum, item) => {
            const price = calculateOrderItemPrice(item);
            return itemSum + safeNumber(price);
          }, 0) ?? 0
        );
        return sum + itemsTotal;
      }, 0) ?? 0
    );
  }, [orders]);

  const taxCollected = useMemo(() => {
    return safeNumber(
      orders?.filter(order => order.status === OrderStatus.Paid).reduce((sum, order) => sum + safeNumber(order.tax_amount), 0) ?? 0
    );
  }, [orders]);

  const serviceCharges = useMemo(() => {
    return safeNumber(
      orders?.filter(order => order.status === OrderStatus.Paid).reduce((sum, order) => sum + safeNumber(order.service_charge_amount), 0) ?? 0
    );
  }, [orders]);

  const itemDiscounts = useMemo(() => {
    return safeNumber(
      orders?.filter(order => order.status === OrderStatus.Paid).reduce((sum, order) => {
        return sum + safeNumber(order.items?.reduce((itemSum, item) => itemSum + safeNumber(item?.discount), 0) ?? 0);
      }, 0) ?? 0
    );
  }, [orders]);

  const subtotalDiscounts = useMemo(() => {
    return safeNumber(
      orders?.filter(order => order.status === OrderStatus.Paid).reduce((sum, order) => {
        const lineDiscounts = safeNumber(
          order.items?.reduce((itemSum, item) => itemSum + safeNumber(item?.discount), 0) ?? 0
        );
        const orderDiscount = safeNumber(order.discount_amount);
        const extraDiscount = Math.max(0, safeNumber(orderDiscount - lineDiscounts));
        return sum + extraDiscount;
      }, 0) ?? 0
    );
  }, [orders]);

  const discounts = useMemo(() => safeNumber(itemDiscounts + subtotalDiscounts), [itemDiscounts, subtotalDiscounts]);

  const totalExtras = useMemo(() => {
    return safeNumber(
      orders?.filter(order => order.status === OrderStatus.Paid).reduce((sum, order) => {
        return sum + safeNumber(
          order?.extras?.reduce((extraSum, extra) => extraSum + safeNumber(extra.value), 0) ?? 0
        );
      }, 0) ?? 0
    );
  }, [orders]);

  const refunds = useMemo(() => {
    return safeNumber(
      orders?.reduce((sum, order) => {
        if (order.status === OrderStatus.Cancelled) {
          return sum + safeNumber(
            order.payments?.reduce((paySum, payment) => {
              const amount = safeNumber(payment?.amount);
              return paySum + Math.abs(Math.min(0, amount));
            }, 0) ?? 0
          );
        }
        return sum + safeNumber(
          order.payments?.reduce((paySum, payment) => {
            const amount = safeNumber(payment?.amount);
            return paySum + (amount < 0 ? Math.abs(amount) : 0);
          }, 0) ?? 0
        );
      }, 0) ?? 0
    );
  }, [orders]);

  const voids = useMemo(() => {
    return safeNumber(
      orders?.reduce((sum, order) => {
        const allItems = order.items || [];
        const filteredItems = getOrderFilteredItems(order);
        const voidedItems = allItems.filter(item => 
          !filteredItems.some(filtered => filtered.id === item.id)
        );
        return sum + safeNumber(
          voidedItems.reduce((itemSum, item) => {
            const price = calculateOrderItemPrice(item);
            return itemSum + safeNumber(price);
          }, 0)
        );
      }, 0) ?? 0
    );
  }, [orders]);

  const tips = useMemo(() => {
    return safeNumber(
      orders?.filter(order => order.status === OrderStatus.Paid).reduce((prev, item) => prev + safeNumber(item.tip_amount), 0) ?? 0
    );
  }, [orders]);

  const handleClockOut = async () => {
    if (!timeEntry || !page.user) return;

    try {
      const clockOutTime = nowSurrealDateTime();
      const clockInTime = toJsDate(timeEntry.clock_in);
      const durationSeconds = Math.floor((toJsDate(clockOutTime).getTime() - clockInTime.getTime()) / 1000);

      // Update time entry with clock out time and duration
      await db.merge(timeEntry.id, {
        clock_out: clockOutTime,
        duration_seconds: durationSeconds,
      });

      toast.success(t("toast:clock.clockedOut"));

      // Log out user
      setPage(prev => ({
        ...prev,
        page: 'Login',
        user: undefined
      }));

      navigation(LOGIN);
    } catch (error) {
      toast.error(t("toast:clock.clockOutFailed"));
      console.error(error);
    }
  };

  if (isLoading) {
    return (
      <Layout containerClassName="p-5">
        <div className="bg-white shadow p-5 rounded-lg">
          <p>{t("summary:clock.loading")}</p>
        </div>
      </Layout>
    );
  }

  if (!timeEntry) {
    return null;
  }

  const clockInDate = toJsDate(timeEntry.clock_in);
  const formattedClockInTime = toLuxonDateTime(timeEntry.clock_in).toFormat('hh:mm a');
  const formattedClockInDate = toLuxonDateTime(timeEntry.clock_in).toFormat('MMMM dd, yyyy');

  const user = page.user;
  const userDisplayName = user
    ? [user.first_name, user.last_name].map(s => s?.trim()).filter(Boolean).join(' ') || user.login
    : '';

  return (
    <Layout containerClassName="p-5">
      {/* Sale Summary Widgets */}
      <div className="bg-white p-5 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4 text-neutral-700">{t("summary:clock.saleSummary")}</h2>
        {ordersLoading ? (
          <div className="flex justify-center items-center py-8">
            <p className="text-neutral-500">{t("summary:clock.loadingSaleData")}</p>
          </div>
        ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Total Sales Widget */}
          <div className="bg-gradient-to-br from-success-100 to-success-200 p-2 rounded-lg border border-success-300">
            <p className="text-sm text-success-700 font-medium mb-1">{t("summary:clock.metrics.totalSales")}</p>
            <p className="text-2xl font-bold text-success-900">{withCurrency(salePriceWithoutTax)}</p>
          </div>

          {/* Refunds Widget */}
          <div className="bg-gradient-to-br from-danger-100 to-danger-200 p-2 rounded-lg border border-danger-300">
            <p className="text-sm text-danger-700 font-medium mb-1">{t("summary:clock.metrics.refunds")}</p>
            <p className="text-2xl font-bold text-danger-900">{withCurrency(refunds)}</p>
          </div>

          {/* Service Charges Widget */}
          <div className="bg-gradient-to-br from-info-100 to-info-200 p-2 rounded-lg border border-info-300">
            <p className="text-sm text-info-700 font-medium mb-1">{t("summary:clock.metrics.serviceCharges")}</p>
            <p className="text-2xl font-bold text-info-900">{withCurrency(serviceCharges)}</p>
          </div>

          {/* Discounts Widget */}
          <div className="bg-gradient-to-br from-warning-100 to-warning-200 p-2 rounded-lg border border-warning-300">
            <p className="text-sm text-warning-700 font-medium mb-1">{t("summary:clock.metrics.discounts")}</p>
            <p className="text-2xl font-bold text-warning-900">{withCurrency(discounts)}</p>
          </div>

          {/* Taxes Widget */}
          <div className="bg-gradient-to-br from-primary-100 to-primary-200 p-2 rounded-lg border border-primary-300">
            <p className="text-sm text-primary-700 font-medium mb-1">{t("summary:clock.metrics.taxes")}</p>
            <p className="text-2xl font-bold text-primary-900">{withCurrency(taxCollected)}</p>
          </div>

          {/* Extras Widget */}
          <div className="bg-gradient-to-br from-info-100 to-info-200 p-2 rounded-lg border border-info-300">
            <p className="text-sm text-info-700 font-medium mb-1">{t("summary:clock.metrics.extras")}</p>
            <p className="text-2xl font-bold text-info-900">{withCurrency(totalExtras)}</p>
          </div>

          {/* Voids Widget */}
          <div className="bg-gradient-to-br from-danger-100 to-danger-200 p-2 rounded-lg border border-danger-300">
            <p className="text-sm text-danger-700 font-medium mb-1">{t("summary:clock.metrics.voids")}</p>
            <p className="text-2xl font-bold text-danger-900">{withCurrency(voids)}</p>
          </div>

          {/* Tips Widget */}
          <div className="bg-gradient-to-br from-success-100 to-success-200 p-2 rounded-lg border border-success-300">
            <p className="text-sm text-success-700 font-medium mb-1">{t("summary:clock.metrics.tips")}</p>
            <p className="text-2xl font-bold text-success-900">{withCurrency(tips)}</p>
          </div>
        </div>
        )}
      </div>

      <div className="bg-white shadow p-5 rounded-lg mt-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-4 rounded-full bg-primary-100">
              <FontAwesomeIcon icon={faClock} size="2x" className="text-primary-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{t("summary:clock.title")}</h1>
              <p className="text-sm text-neutral-500">{t("summary:clock.subtitle")}</p>
            </div>
          </div>
          {user && (
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:max-w-2xl sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-600">
                  <FontAwesomeIcon icon={faUser} className="text-lg" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{t("summary:clock.signedInAs")}</p>
                  <p className="truncate text-lg font-semibold text-neutral-800">{userDisplayName}</p>
                  {user.user_role?.name && (
                    <p className="mt-0.5 text-xs text-neutral-500">{user.user_role.name}</p>
                  )}
                </div>
              </div>
              {resolvedShift && (
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                    <FontAwesomeIcon icon={faBriefcase} className="text-lg" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{t("summary:clock.shift")}</p>
                    <p className="truncate text-lg font-semibold text-neutral-800">{resolvedShift.name}</p>
                    <p className="mt-0.5 text-sm text-neutral-600">
                      {formatShiftClock(resolvedShift.start_time)} – {formatShiftClock(resolvedShift.end_time)}
                      {resolvedShift.ends_next_day ? ` · ${t("summary:clock.endsNextDay")}` : ''}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-neutral-50 p-6 rounded-lg">
            <div className="mb-4">
              <p className="text-sm text-neutral-500 mb-1">{t("summary:clock.clockInTime")}</p>
              <p className="text-2xl font-bold">{formattedClockInTime}</p>
              <p className="text-sm text-neutral-400">{formattedClockInDate}</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-8 rounded-lg text-center">
            <p className="text-sm text-neutral-600 mb-2">{t("summary:clock.timeElapsed")}</p>
            <div className="text-5xl font-bold text-primary-700 mb-2">
              <Countdown time={clockInDate} showAll={true} />
            </div>
            <p className="text-sm text-neutral-500">{t("summary:clock.sinceClockIn")}</p>
          </div>

          <div className="flex justify-center gap-3 pt-4">
            <Button
              variant="danger"
              onClick={handleClockOut}
              size="xl"
              icon={faClock}
            >
              {t("summary:clock.clockOut")}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

