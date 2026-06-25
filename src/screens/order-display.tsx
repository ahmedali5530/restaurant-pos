import { Layout } from '@/screens/partials/layout.tsx';
import useApi, { SettingsData } from '@/api/db/use.api.ts';
import { Order as OrderModel, ORDER_FETCHES, OrderStatus } from '@/api/model/order.ts';
import { OrderItemKitchen } from '@/api/model/order_item_kitchen.ts';
import { Tables } from '@/api/db/tables.ts';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDB } from '@/api/db/db.ts';
import { OrderType } from '@/api/model/order_type.ts';
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx';
import { useAtom } from 'jotai';
import { appState, AppStateInterface } from '@/store/jotai.ts';
import { LabelValue } from '@/api/model/common.ts';
import { Button } from '@/components/common/input/button.tsx';
import { toSurrealDateTime, getAppStartOfDaySurreal } from '@/lib/datetime.ts';
import { useTranslation } from 'react-i18next';
import { translateOrderStatus } from '@/lib/order.ts';
import {
  buildKitchenRowsMap,
  ORDER_DISPLAY_MAX_VISIBLE,
  partitionDisplayOrders,
} from '@/lib/order-display.ts';
import { OrderTile } from '@/components/order-display/order-tile.tsx';
import { OrderReadyCelebration } from '@/components/order-display/order-ready-celebration.tsx';
import { useOrderReadyAnnouncements } from '@/hooks/useOrderReadyAnnouncements.ts';
import { faBars } from '@fortawesome/free-solid-svg-icons';

export const OrderDisplayScreen = () => {
  const { t } = useTranslation(['order-display', 'orders']);
  const db = useDB();
  const [state, setState] = useAtom(appState);
  const [orders, setOrders] = useState<OrderModel[]>([]);
  const [kitchenRowsByOrderItemId, setKitchenRowsByOrderItemId] = useState(
    buildKitchenRowsMap()
  );
  const [showSidebar, setShowSidebar] = useState(false);
  const liveOrdersRef = useRef<{ kill: () => Promise<void> } | null>(null);
  const liveKitchenRef = useRef<{ kill: () => Promise<void> } | null>(null);

  const defaultStatusFilter = useMemo(
    () => [{ label: OrderStatus['In Progress'], value: OrderStatus['In Progress'] }],
    []
  );

  const selectedFilters = useMemo(
    () => ({
      statuses:
        state?.orderDisplayFilters?.statuses?.length
          ? state.orderDisplayFilters.statuses
          : defaultStatusFilter,
      orderTypes: state?.orderDisplayFilters?.orderTypes ?? [],
    }),
    [state?.orderDisplayFilters, defaultStatusFilter]
  );

  const updateFilter = useCallback(
    (key: keyof AppStateInterface['orderDisplayFilters'], value: LabelValue[]) => {
      setState((prev) => ({
        ...prev,
        orderDisplayFilters: {
          statuses: prev?.orderDisplayFilters?.statuses ?? [],
          orderTypes: prev?.orderDisplayFilters?.orderTypes ?? [],
          [key]: value ?? [],
        },
      }));
    },
    [setState]
  );

  const { data: orderTypes } = useApi<SettingsData<OrderType>>(
    Tables.order_types,
    ['deleted_at = none'],
    [],
    0,
    99999
  );

  const whereClauses = useMemo(() => {
    const clauses: string[] = [];

    const statusFilters = selectedFilters.statuses.map(
      (status) => `status = "${status.value}"`
    );
    if (statusFilters.length > 0) {
      clauses.push(`(${statusFilters.join(' or ')})`);
    }

    const orderTypeFilters = selectedFilters.orderTypes.map(
      (orderType) => `order_type = ${orderType.value}`
    );
    if (orderTypeFilters.length > 0) {
      clauses.push(`(${orderTypeFilters.join(' or ')})`);
    }

    return clauses;
  }, [selectedFilters]);

  const fetchOrders = useCallback(async () => {
    const startDate = getAppStartOfDaySurreal();
    const filterSql = whereClauses.length > 0 ? `and ${whereClauses.join(' and ')}` : '';
    const fetchList = ORDER_FETCHES.join(', ');

    const [rows, kitchenRows] = await db.query(
      `SELECT * FROM ${Tables.orders}
       WHERE created_at >= $startDate ${filterSql}
       ORDER BY created_at DESC
       FETCH ${fetchList};
       SELECT * FROM ${Tables.order_items_kitchen}
       WHERE created_at >= $startDate
         AND order_item.is_suspended != true
       FETCH order_item`,
      { startDate }
    );

    setOrders(Array.isArray(rows) ? (rows as OrderModel[]) : []);
    setKitchenRowsByOrderItemId(
      buildKitchenRowsMap(Array.isArray(kitchenRows) ? (kitchenRows as OrderItemKitchen[]) : [])
    );
  }, [whereClauses]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      const ordersSubscription = await db.live(Tables.orders, () => {
        void fetchOrders();
      });
      const kitchenSubscription = await db.live(Tables.order_items_kitchen, () => {
        void fetchOrders();
      });

      if (cancelled) {
        await ordersSubscription.kill().catch(() => undefined);
        await kitchenSubscription.kill().catch(() => undefined);
        return;
      }

      liveOrdersRef.current = ordersSubscription;
      liveKitchenRef.current = kitchenSubscription;
    };

    void setup();

    return () => {
      cancelled = true;
      liveOrdersRef.current?.kill().catch(() => undefined);
      liveKitchenRef.current?.kill().catch(() => undefined);
      liveOrdersRef.current = null;
      liveKitchenRef.current = null;
    };
  }, [fetchOrders]);

  const { preparing, ready } = useMemo(
    () => partitionDisplayOrders(orders, kitchenRowsByOrderItemId, ORDER_DISPLAY_MAX_VISIBLE),
    [orders, kitchenRowsByOrderItemId]
  );

  const { activeCelebration, completeCelebration, highlightedOrderIds } =
    useOrderReadyAnnouncements(ready);

  return (
    <Layout showSidebar={showSidebar} overflowHidden containerClassName="overflow-hidden">
      {activeCelebration && (
        <OrderReadyCelebration
          orderNumber={activeCelebration.orderNumber}
          onComplete={completeCelebration}
        />
      )}
      <div className="flex flex-col gap-3 p-3 h-full">
        <div className="h-[60px] flex-shrink-0 rounded-xl bg-white flex items-center px-3 gap-3">
          <div className="min-w-[200px]">
            <ReactSelect
              options={[
                OrderStatus['In Progress'],
                OrderStatus.Pending,
                OrderStatus.Paid,
                OrderStatus.Cancelled,
                OrderStatus.Spilt,
                OrderStatus.Merged,
              ].map((item) => ({
                label: translateOrderStatus(t, item),
                value: item,
              }))}
              isMulti
              placeholder={t('order-display:filters.status')}
              value={selectedFilters.statuses}
              onChange={(value: LabelValue[]) => updateFilter('statuses', value)}
            />
          </div>
          <div className="min-w-[200px]">
            <ReactSelect
              options={orderTypes?.data.map((item) => ({
                label: item.name,
                value: item.id,
              }))}
              isMulti
              placeholder={t('order-display:filters.orderTypes')}
              value={selectedFilters.orderTypes}
              onChange={(value: LabelValue[]) => updateFilter('orderTypes', value)}
            />
          </div>
          <div className="flex-1 flex justify-end">
            <Button
              icon={faBars}
              variant="neutral"
              active={showSidebar}
              onClick={() => setShowSidebar((prev) => !prev)}
            >
              {t('order-display:toggleSidebar')}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 gap-3 min-h-0">
          <div className="flex-1 flex flex-col rounded-xl bg-neutral-100 overflow-hidden">
            <div className="flex-shrink-0 px-4 py-3 bg-warning-500 text-white">
              <h2 className="text-2xl font-bold uppercase tracking-wide">
                {t('order-display:preparing')}
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {preparing.map((order) => (
                  <OrderTile key={order.id.toString()} order={order} variant="preparing" />
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col rounded-xl bg-neutral-100 overflow-hidden">
            <div className="flex-shrink-0 px-4 py-3 bg-success-600 text-white">
              <h2 className="text-2xl font-bold uppercase tracking-wide">
                {t('order-display:readyForPickup')}
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {ready.map((order) => (
                  <OrderTile
                    key={order.id.toString()}
                    order={order}
                    variant="ready"
                    celebrate={highlightedOrderIds.has(order.id.toString())}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
