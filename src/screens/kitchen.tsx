import {Layout} from "@/screens/partials/layout.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faClose} from "@fortawesome/free-solid-svg-icons";
import ScrollContainer from "react-indiana-drag-scroll";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Kitchen, KitchenOrder as KitchenOrderModel} from "@/api/model/kitchen.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useDB} from "@/api/db/db.ts";
import {OrderItemKitchen} from "@/api/model/order_item_kitchen.ts";
import {KitchenOrder} from "@/components/kitchen/kitchen.order.tsx";
import {cn, toRecordId} from "@/lib/utils.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {LiveSubscription} from "surrealdb";
import {toLuxonDateTime, getAppStartOfDaySurreal} from "@/lib/datetime.ts";
import {getInvoiceNumber} from "@/lib/order.ts";
import {assertOrderMutationsAllowed} from "@/lib/closing.guard.ts";
import {toast} from "sonner";
import {useAtom} from "jotai";
import {appPage, closingEnforcementAtom} from "@/store/jotai.ts";
import {completeStages, recallStage} from "@/lib/kitchen/workflow.service.ts";
import {useTranslation} from "react-i18next";


export const KitchenScreen = () => {
  const {t} = useTranslation(["kitchen", "toast"]);
  const db = useDB();
  const [enforcement] = useAtom(closingEnforcementAtom);
  const [page] = useAtom(appPage);
  const mutationsBlocked = enforcement.orderMutationsBlocked;

  const [kitchen, setKitchen] = useState<Kitchen>();
  const {
    data: kitchens
  } = useApi<SettingsData<Kitchen>>(Tables.kitchens, ['deleted_at = none'], ['priority asc'], 0, 10, ['items', 'printers']);
  const [allOrders, setOrders] = useState<KitchenOrderModel[]>([]);
  const orders = useMemo(() => {
    // Items already completed by the current user are excluded at query time;
    // here we just drop groups that have no remaining non-deleted items.
    return allOrders.filter(item => {
      return item.items.some(iitem => !iitem.order_item?.deleted_at);
    })
  }, [allOrders]);
  const [avgTime, setAvgTime] = useState('-');
  const [showCompletedOrdersModal, setShowCompletedOrdersModal] = useState(false);
  const [completedOrders, setCompletedOrders] = useState<KitchenOrderModel[]>([]);
  const [loadingCompletedOrders, setLoadingCompletedOrders] = useState(false);
  const [recallingOrderKey, setRecallingOrderKey] = useState<string | null>(null);
  const loadOrdersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveFetchedOrder = (value: unknown): Order | undefined => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const candidate = value as Order;
    if (candidate.invoice_number == null) {
      return undefined;
    }

    return candidate;
  };

  const groupKitchenOrderItems = useCallback((records: OrderItemKitchen[] = []) => {
    const groupedOrders = new Map<string, KitchenOrderModel>();

    for (const item of records ?? []) {
      const order = resolveFetchedOrder(item.order_item?.order);
      const orderId = order?.id?.toString() ?? String(item.order_item?.order ?? '');
      const createdAtKey = (item as any).batch_created_at ?? '';
      const groupKey = `${orderId}_${createdAtKey}`;

      if (!groupedOrders.has(groupKey)) {
        groupedOrders.set(groupKey, {
          order,
          items: []
        });
      }

      const group = groupedOrders.get(groupKey);
      group?.items.push(item);
      if (order && group && !group.order) {
        group.order = order;
      }
    }

    return Array.from(groupedOrders.values());
  }, []);

  const loadOrders = useCallback(async (kitchenId: string) => {
    const currentUser = page?.user?.id;
    const userClause = currentUser ? `and completed_by CONTAINSNOT $currentUser` : '';

    const [kitchenOrderItemsRecord]: any = await db.query(`
        select *,
               time ::format(created_at, '%F %T') as batch_created_at
        from ${Tables.order_items_kitchen}
        where kitchen = $kitchen
          and activated_at != None
        and status in ['pending', 'in_progress', 'completed'] ${userClause}
          and created_at >= $startDate
          and order_item.is_suspended != true
        order by created_at desc
            fetch order_item, order_item.item, order_item.order, order_item.order.table, order_item.order.user, order_item.order.order_type
    `, {
      kitchen: toRecordId(kitchenId),
      currentUser: toRecordId(currentUser),
      startDate: getAppStartOfDaySurreal()
    });

    setOrders(groupKitchenOrderItems(kitchenOrderItemsRecord ?? []));

    await calculateAverageTime(kitchenId);
  }, [groupKitchenOrderItems, page?.user?.id]);

  const loadCompletedOrders = useCallback(async (kitchenId: string) => {
    setLoadingCompletedOrders(true);

    try {
      const [kitchenOrderItemsRecord]: any = await db.query(`
          select *,
                 time ::format(created_at, '%F %T') as batch_created_at
          from ${Tables.order_items_kitchen}
          where kitchen = $kitchen
            and completed_by CONTAINS $currentUser
            and created_at >= $startDate
            and order_item.is_suspended != true
          order by completed_at desc
              fetch order_item, order_item.item, order_item.order, order_item.order.table, order_item.order.user, order_item.order.order_type
      `, {
        kitchen: toRecordId(kitchenId),
        currentUser: toRecordId(page?.user?.id),
        startDate: getAppStartOfDaySurreal()
      });

      const groupedCompletedOrders = groupKitchenOrderItems(kitchenOrderItemsRecord ?? []);
      setCompletedOrders(groupedCompletedOrders);
    } finally {
      setLoadingCompletedOrders(false);
    }
  }, [groupKitchenOrderItems, page?.user?.id]);

  const openCompletedOrdersModal = async () => {
    if (!kitchen?.id) {
      return;
    }

    setShowCompletedOrdersModal(true);
    await loadCompletedOrders(kitchen.id);
  }

  const recallCompletedOrder = async (order: KitchenOrderModel, index: number) => {
    if (!kitchen?.id) {
      return;
    }

    const recallableItems = order.items;
    if (recallableItems.length === 0) {
      return;
    }

    const orderKey = `${order.order?.id ?? index}_${order.items[0]?.created_at?.toString() ?? ''}`;
    setRecallingOrderKey(orderKey);

    try {
      await assertOrderMutationsAllowed(db);

      await Promise.all(recallableItems.map((item) => {
        return recallStage(db, item.id.toString(), page?.user?.id);
      }));

      await loadOrders(kitchen.id);
      await loadCompletedOrders(kitchen.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("toast:kitchen.recallFailed");
      toast.error(message);
    } finally {
      setRecallingOrderKey(null);
    }
  }

  useEffect(() => {
    if (!kitchen && kitchens?.total > 0) {
      setKitchen(kitchens?.data?.[0]);
    }
  }, [kitchens, kitchen]);

  const scheduleLoadOrders = useCallback((kitchenId: string) => {
    if (loadOrdersTimerRef.current) {
      clearTimeout(loadOrdersTimerRef.current);
    }

    loadOrdersTimerRef.current = setTimeout(() => {
      void loadOrders(kitchenId);
    }, 200);
  }, [loadOrders]);

  const [ordersLiveQuery, setOrdersLiveQuery] = useState<LiveSubscription | null>(null);
  const [kitchenItemsLiveQuery, setKitchenItemsLiveQuery] = useState<LiveSubscription | null>(null);
  const [orderItemsLiveQuery, setOrderItemsLiveQuery] = useState<LiveSubscription | null>(null);

  const runLiveQuery = async () => {
    if (!kitchen?.id) {
      return;
    }

    const kitchenId = kitchen.id.toString();
    const refresh = () => scheduleLoadOrders(kitchenId);

    const result = await db.live(Tables.orders, (action) => {
      if (action === 'CREATE' || action === 'UPDATE') {
        refresh();
      }
    });

    const kitchenItems = await db.live(Tables.order_items_kitchen, (action) => {
      if (action === 'CREATE' || action === 'UPDATE') {
        refresh();
      }
    });

    const orderItems = await db.live(Tables.order_items, (action) => {
      if (action === 'CREATE' || action === 'UPDATE') {
        refresh();
      }
    });

    setOrdersLiveQuery(result);
    setKitchenItemsLiveQuery(kitchenItems);
    setOrderItemsLiveQuery(orderItems);
  }

  useEffect(() => {
    if (kitchen) {
      loadOrders(kitchen.id);
      runLiveQuery();
    }

    return () => {
      if (loadOrdersTimerRef.current) {
        clearTimeout(loadOrdersTimerRef.current);
      }
      ordersLiveQuery?.kill().catch(() => undefined);
      kitchenItemsLiveQuery?.kill().catch(() => undefined);
      orderItemsLiveQuery?.kill().catch(() => undefined);
    }
  }, [kitchen]);

  const calculateAverageTime = useCallback(async (kitchenId: string) => {
    const startDate = getAppStartOfDaySurreal();
    const maxPrepMinutes = 240;

    const [rows]: any = await db.query(
      `SELECT completed_at, activated_at, created_at
       FROM ${Tables.order_items_kitchen}
       WHERE kitchen = $kitchen
         AND completed_at != None
         AND created_at >= $startDate`,
      {
        kitchen: toRecordId(kitchenId),
        startDate,
      }
    );

    const durations: number[] = [];

    for (const row of rows ?? []) {
      const start = row.activated_at ?? row.created_at;
      const end = row.completed_at;
      if (!start || !end) {
        continue;
      }

      const startAt = toLuxonDateTime(start);
      const endAt = toLuxonDateTime(end);
      if (!startAt.isValid || !endAt.isValid) {
        continue;
      }

      const minutes = endAt.diff(startAt, 'minutes').minutes;
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > maxPrepMinutes) {
        continue;
      }

      durations.push(minutes);
    }

    if (durations.length === 0) {
      setAvgTime('-');
      return;
    }

    const averageMinutes = Math.round(
      durations.reduce((sum, value) => sum + value, 0) / durations.length
    );
    setAvgTime(t('kitchen:labels.avgTimeMins', { count: averageMinutes }));
  }, [t]);

  const completeAllOrders = async () => {
    if (confirm(t("kitchen:confirm.completeAll"))) {
      const userId = page?.user?.id;
      const ids = orders.flatMap((group) =>
        group.items
          .filter((item) => !item.order_item?.deleted_at)
          .map((item) => item.id.toString())
      );
      await completeStages(db, ids, userId);

      if (kitchen?.id) {
        await loadOrders(kitchen.id);
      }
    }
  }

  const allDishes = useMemo(() => {
    const itemsMap = new Map();
    orders.forEach(item => {
      item.items.forEach(orderItem => {
        const itemName = orderItem.order_item.item.name;
        itemsMap.set(itemName, (itemsMap.get(itemName) ?? 0) + orderItem.order_item.quantity);
      })
    });

    return Array.from(itemsMap);
  }, [orders]);

  const [dishesModal, setDishesModal] = useState(false);

  return (
    <Layout containerClassName="overflow-hidden">
      <div className="flex gap-5 p-3 flex-col">
        <div className="h-[60px] flex-0 rounded-xl bg-white flex items-center px-3 gap-3 justify-between">
          <div className="input-group flex-1">
            {kitchens?.data?.map(item => (
              <Button
                size="lg"
                variant="primary"
                onClick={() => setKitchen(item)}
                active={item.id.toString() === kitchen?.id?.toString()}
                key={item.id}
                className="min-w-[200px]"
              >
                {item.name}
              </Button>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="success" size="lg"
                    onClick={completeAllOrders}>{t("kitchen:actions.completeAllOpen")}</Button>
            <Button variant="secondary" size="lg"
                    onClick={openCompletedOrdersModal}>{t("kitchen:actions.completedOrders")}</Button>
            <Button variant="secondary" size="lg"
                    onClick={() => setDishesModal(!dishesModal)}>{t("kitchen:actions.viewAllDishes")}</Button>
          </div>
          <div className="input-group flex-1 justify-end flex gap-3 items-center h-full">
            <span
              className="bg-neutral-900 text-warning-500 text-2xl h-full flex items-center px-3">{t("kitchen:labels.avgTime", {time: avgTime})}</span>
            {/*<span>timer</span>*/}
          </div>
        </div>
        <div className="grid grid-cols-5 gap-5">
          <ScrollContainer className={cn(
            'h-[calc(100vh_-_110px)] select-none',
            dishesModal ? 'col-span-4' : 'col-span-5'
          )}>
            <div className="flex-1 rounded-xl flex gap-3 flex-row">
              {orders.map((item, index) => (
                <div className="w-[400px] flex-shrink-0" key={index}>
                  <KitchenOrder order={item}/>
                </div>
              ))}
            </div>
          </ScrollContainer>

          {dishesModal && (
            <div className="flex flex-col col-span-1 bg-white rounded-xl">
              <button
                onClick={() => setDishesModal(false)}
                className="bg-black text-white self-end mb-5 inline-flex h-12 w-12 justify-center items-center">
                <FontAwesomeIcon icon={faClose}/>
              </button>
              <ScrollContainer className={cn(
                'h-[calc(100vh_-_200px)] select-none',
              )}>
                {allDishes.map((item, index) => (
                  <div className="flex justify-between text-2xl odd:bg-gray-200 p-3" key={index}>
                    <strong>{item[0]}</strong>
                    <span className="bg-black text-warning-500 w-12 text-center">{item[1]}</span>
                  </div>
                ))}
              </ScrollContainer>
            </div>
          )}
        </div>
      </div>
      <Modal
        open={showCompletedOrdersModal}
        onClose={() => {
          setShowCompletedOrdersModal(false);
          setCompletedOrders([]);
        }}
        title={t("kitchen:modal.completedOrdersTitle", {kitchen: kitchen?.name ?? ""})}
        size="md"
      >
        <div className="space-y-3 max-h-[70vh] overflow-auto">
          {!loadingCompletedOrders && completedOrders.length === 0 && (
            <div className="p-4 rounded bg-white text-center text-neutral-600">
              {t("kitchen:modal.noCompletedOrders")}
            </div>
          )}

          {completedOrders.map((item, index) => {
            const orderKey = `${item.order?.id ?? index}_${item.items[0]?.created_at?.toString() ?? ''}`;
            const completedAt = item.items?.[0]?.completed_at ?? item.items?.[0]?.created_at;

            return (
              <div key={orderKey} className="bg-white rounded-lg p-4 flex justify-between gap-4 items-center">
                <div className="flex flex-col">
                  <strong className="text-lg">
                    {item.order?.order_type?.name} / {item.order ? getInvoiceNumber(item.order) : '-'}
                  </strong>
                  <span className="text-neutral-600">
                    {t("kitchen:labels.completed", {time: toLuxonDateTime(completedAt).toFormat('hh:mm a')})}
                  </span>
                  <span className="text-neutral-600">
                    {t("kitchen:labels.items", {count: item.items.length})}
                  </span>
                </div>
                <Button
                  variant="warning"
                  filled
                  isDisabled={mutationsBlocked}
                  isLoading={recallingOrderKey === orderKey}
                  onClick={() => recallCompletedOrder(item, index)}
                >
                  {t("kitchen:actions.recall")}
                </Button>
              </div>
            );
          })}
        </div>
      </Modal>
    </Layout>
  )
}
