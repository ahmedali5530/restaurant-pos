import {Layout} from "@/screens/partials/layout.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faClose} from "@fortawesome/free-solid-svg-icons";
import ScrollContainer from "react-indiana-drag-scroll";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {
  Kitchen,
  KitchenOrder as KitchenOrderModel,
  KitchenOrderBatch,
  KitchenOrderTicket,
} from "@/api/model/kitchen.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useDB} from "@/api/db/db.ts";
import {OrderItemKitchen} from "@/api/model/order_item_kitchen.ts";
import {KitchenBoardTicket, KitchenOrder} from "@/components/kitchen/kitchen.order.tsx";
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
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {DocumentTitle} from "@/components/common/document-title.tsx";
import {useKitchenOrderAnnouncements} from "@/hooks/useKitchenOrderAnnouncements.ts";
import {unlockSpeech} from "@/lib/order-ready-announcement.ts";

/** Approximate vertical budget (px) for chrome around item rows on a ticket. */
const CARD_CHROME_PX = 168;
/** Approximate height of one dish row on the ticket. */
const ITEM_ROW_PX = 44;
const MIN_ITEMS_PER_CARD = 3;

/** Bright borders for multi-part orders (original + addons / continued). */
const ORDER_GROUP_COLORS = [
  '#ff1744', // vivid red
  '#00e676', // neon green
  '#2979ff', // electric blue
  '#ff9100', // bright orange
  '#d500f9', // vivid magenta
  '#00e5ff', // cyan
  '#ffea00', // pure yellow
  '#76ff03', // lime
  '#f50057', // hot pink
  '#651fff', // deep bright purple
  '#ff6d00', // deep orange
  '#1de9b6', // teal accent
];

/**
 * Assign sequential colors to multi-part orders in board order so neighboring
 * multi-part tickets rarely share a border (avoids hash collisions).
 */
const assignOrderGroupColors = (
  multiPartOrderIds: string[]
): Map<string, string> => {
  const colorByOrder = new Map<string, string>();
  const n = ORDER_GROUP_COLORS.length;

  multiPartOrderIds.forEach((orderId, index) => {
    let color = ORDER_GROUP_COLORS[index % n];
    const prevColor = index > 0
      ? colorByOrder.get(multiPartOrderIds[index - 1])
      : undefined;
    // Avoid same color as previous multi-part order on the board.
    if (color === prevColor) {
      color = ORDER_GROUP_COLORS[(index + 1) % n];
    }
    // Also try not to match second-previous when palette wraps.
    const prev2 = index > 1
      ? colorByOrder.get(multiPartOrderIds[index - 2])
      : undefined;
    if (color === prev2 || color === prevColor) {
      color = ORDER_GROUP_COLORS[(index + 2) % n];
    }
    colorByOrder.set(orderId, color);
  });

  return colorByOrder;
};

const batchIsAddon = (batch: KitchenOrderBatch) =>
  batch.items.some((item) => item.order_item?.is_addition);

const isMultiPartGroup = (
  group: KitchenOrderModel,
  maxItemsPerCard: number
) => {
  const multiBatch = group.batches.length > 1;
  const hasAddon = group.batches.some(batchIsAddon);
  const totalChunks = group.batches.reduce(
    (sum, batch) => sum + Math.max(1, Math.ceil(batch.items.length / maxItemsPerCard)),
    0
  );
  return multiBatch || hasAddon || totalChunks > 1;
};

const buildBoardTickets = (
  orders: KitchenOrderModel[],
  maxItemsPerCard: number
): KitchenBoardTicket[] => {
  const tickets: KitchenBoardTicket[] = [];

  const multiPartOrderIds: string[] = [];
  for (const group of orders) {
    if (!isMultiPartGroup(group, maxItemsPerCard)) {
      continue;
    }
    const orderId = group.order?.id?.toString()
      ?? group.batches[0]?.batchKey
      ?? '';
    if (orderId && !multiPartOrderIds.includes(orderId)) {
      multiPartOrderIds.push(orderId);
    }
  }
  const colorByOrder = assignOrderGroupColors(multiPartOrderIds);

  for (const group of orders) {
    const multiBatch = group.batches.length > 1;
    const orderId = group.order?.id?.toString()
      ?? group.batches[0]?.batchKey
      ?? '';
    const groupColor = isMultiPartGroup(group, maxItemsPerCard)
      ? colorByOrder.get(orderId)
      : undefined;

    for (const batch of group.batches) {
      const isAddon = batchIsAddon(batch);
      const items = batch.items;
      const chunkTotal = Math.max(1, Math.ceil(items.length / maxItemsPerCard));

      for (let chunkIndex = 0; chunkIndex < chunkTotal; chunkIndex++) {
        const start = chunkIndex * maxItemsPerCard;
        const slice = items.slice(start, start + maxItemsPerCard);

        tickets.push({
          order: group.order,
          batch: {
            ...batch,
            items: slice,
          },
          reprintItems: items,
          isAddon,
          isContinued: chunkIndex > 0,
          chunkIndex,
          chunkTotal,
          showKindLabel: multiBatch || isAddon || chunkTotal > 1,
          groupColor,
        });
      }
    }
  }

  return tickets;
};


export const KitchenScreen = () => {
  const {t} = useTranslation(["kitchen", "toast"]);
  const {t: tNav} = useTranslation('navigation');
  const db = useDB();
  const [enforcement] = useAtom(closingEnforcementAtom);
  const [page] = useAtom(appPage);
  const mutationsBlocked = enforcement.orderMutationsBlocked;

  const [kitchen, setKitchen] = useState<Kitchen>();
  const {
    data: kitchens
  } = useApi<SettingsData<Kitchen>>(Tables.kitchens, ['deleted_at = none'], ['priority asc'], 0, 10, ['items', 'printers']);
  const [allOrders, setOrders] = useState<KitchenOrderModel[]>([]);
  const [ordersHydrated, setOrdersHydrated] = useState(false);
  const orders = useMemo(() => {
    // Drop groups that have no remaining non-deleted items (voided lines stay visible
    // inside a batch if other items remain).
    return allOrders.filter((group) =>
      group.batches.some((batch) =>
        batch.items.some((iitem) => !iitem.order_item?.deleted_at)
      )
    );
  }, [allOrders]);

  const {highlightedBatchKeys} = useKitchenOrderAnnouncements(
    orders,
    kitchen?.id?.toString(),
    ordersHydrated
  );

  const boardAreaRef = useRef<HTMLDivElement | null>(null);
  const [maxItemsPerCard, setMaxItemsPerCard] = useState(12);

  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) {
      return;
    }

    const update = () => {
      const available = Math.max(120, el.clientHeight - CARD_CHROME_PX);
      setMaxItemsPerCard(Math.max(MIN_ITEMS_PER_CARD, Math.floor(available / ITEM_ROW_PX)));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [kitchen?.id]);

  const boardTickets = useMemo(
    () => buildBoardTickets(orders, maxItemsPerCard),
    [orders, maxItemsPerCard]
  );

  const [avgTime, setAvgTime] = useState('-');
  const [showCompletedOrdersModal, setShowCompletedOrdersModal] = useState(false);
  const [completedOrders, setCompletedOrders] = useState<KitchenOrderTicket[]>([]);
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

  const groupIntoBatches = useCallback((records: OrderItemKitchen[] = []): KitchenOrderTicket[] => {
    const batches = new Map<string, KitchenOrderTicket>();

    for (const item of records ?? []) {
      const order = resolveFetchedOrder(item.order_item?.order);
      const orderId = order?.id?.toString() ?? String(item.order_item?.order ?? '');
      const createdAtKey = (item as any).batch_created_at ?? '';
      const batchKey = `${orderId}_${createdAtKey}`;

      if (!batches.has(batchKey)) {
        batches.set(batchKey, {
          order: order as Order,
          batchKey,
          createdAt: item.created_at ?? createdAtKey,
          items: [],
        });
      }

      const batch = batches.get(batchKey);
      batch?.items.push(item);
      if (order && batch && !batch.order) {
        batch.order = order;
      }
    }

    return Array.from(batches.values());
  }, []);

  const nestBatchesByOrder = useCallback((tickets: KitchenOrderTicket[]): KitchenOrderModel[] => {
    const groups = new Map<string, KitchenOrderModel>();

    for (const ticket of tickets) {
      const orderId = ticket.order?.id?.toString()
        ?? ticket.items[0]?.order_item?.order?.toString()
        ?? ticket.batchKey;

      if (!groups.has(orderId)) {
        groups.set(orderId, {
          order: ticket.order,
          batches: [],
        });
      }

      const group = groups.get(orderId)!;
      if (ticket.order && !group.order) {
        group.order = ticket.order;
      }

      const batch: KitchenOrderBatch = {
        batchKey: ticket.batchKey,
        createdAt: ticket.createdAt,
        items: ticket.items,
      };
      group.batches.push(batch);
    }

    for (const group of groups.values()) {
      group.batches.sort((a, b) => {
        const aTime = toLuxonDateTime(a.createdAt ?? a.items[0]?.created_at).toMillis();
        const bTime = toLuxonDateTime(b.createdAt ?? b.items[0]?.created_at).toMillis();
        return aTime - bTime;
      });
    }

    return Array.from(groups.values()).sort((a, b) => {
      const aNewest = a.batches[a.batches.length - 1];
      const bNewest = b.batches[b.batches.length - 1];
      const aTime = toLuxonDateTime(aNewest?.createdAt ?? aNewest?.items[0]?.created_at).toMillis();
      const bTime = toLuxonDateTime(bNewest?.createdAt ?? bNewest?.items[0]?.created_at).toMillis();
      return bTime - aTime;
    });
  }, []);

  const groupKitchenOrderItems = useCallback((records: OrderItemKitchen[] = []) => {
    return nestBatchesByOrder(groupIntoBatches(records));
  }, [groupIntoBatches, nestBatchesByOrder]);

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
    setOrdersHydrated(true);

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

      // Keep recall list at batch level (not nested by order).
      const tickets = groupIntoBatches(kitchenOrderItemsRecord ?? []);
      tickets.sort((a, b) => {
        const aDone = a.items[0]?.completed_at ?? a.items[0]?.created_at;
        const bDone = b.items[0]?.completed_at ?? b.items[0]?.created_at;
        return toLuxonDateTime(bDone).toMillis() - toLuxonDateTime(aDone).toMillis();
      });
      setCompletedOrders(tickets);
    } finally {
      setLoadingCompletedOrders(false);
    }
  }, [groupIntoBatches, page?.user?.id]);

  const openCompletedOrdersModal = async () => {
    if (!kitchen?.id) {
      return;
    }

    setShowCompletedOrdersModal(true);
    await loadCompletedOrders(kitchen.id);
  }

  const recallCompletedOrder = async (ticket: KitchenOrderTicket) => {
    if (!kitchen?.id) {
      return;
    }

    const recallableItems = ticket.items;
    if (recallableItems.length === 0) {
      return;
    }

    setRecallingOrderKey(ticket.batchKey);

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
      setOrdersHydrated(false);
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
    const userId = page?.user?.id;
    const ids = orders.flatMap((group) =>
      group.batches.flatMap((batch) =>
        batch.items
          .filter((item) => !item.order_item?.deleted_at)
          .map((item) => item.id.toString())
      )
    );
    await completeStages(db, ids, userId);

    if (kitchen?.id) {
      await loadOrders(kitchen.id);
    }
  }

  const allDishes = useMemo(() => {
    const itemsMap = new Map();
    orders.forEach(group => {
      group.batches.forEach(batch => {
        batch.items.forEach(orderItem => {
          const itemName = orderItem.order_item.item.name;
          itemsMap.set(itemName, (itemsMap.get(itemName) ?? 0) + orderItem.order_item.quantity);
        })
      });
    });

    return Array.from(itemsMap);
  }, [orders]);

  const [dishesModal, setDishesModal] = useState(false);
  const speechUnlockedRef = useRef(false);

  const unlockKitchenSpeech = useCallback(() => {
    if (speechUnlockedRef.current) {
      return;
    }
    speechUnlockedRef.current = true;
    unlockSpeech();
  }, []);

  return (
    <Layout containerClassName="overflow-hidden">
      <DocumentTitle parts={[tNav('sidebar.kitchen')]} />
      <div
        className="flex gap-5 p-3 flex-col"
        data-testid="kitchen-page"
        onPointerDown={unlockKitchenSpeech}
        onClick={unlockKitchenSpeech}
      >
        <div className="h-[60px] flex-0 flex items-center gap-3 justify-between" data-testid="kitchen-toolbar">
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
            <DeleteConfirm
              title={t("kitchen:confirm.title")}
              message={t("kitchen:confirm.completeAll")}
              onConfirm={completeAllOrders}
            >
              <Button variant="success" size="lg">
                {t("kitchen:actions.completeAllOpen")}
              </Button>
            </DeleteConfirm>
            <Button variant="secondary" size="lg"
                    onClick={openCompletedOrdersModal}>{t("kitchen:actions.completedOrders")}</Button>
            <Button variant="secondary" size="lg"
                    onClick={() => setDishesModal(!dishesModal)}>{t("kitchen:actions.viewAllDishes")}</Button>
          </div>
          <div className="input-group flex-1 justify-end flex gap-3 items-center h-full">
            <span
              className="rounded-xl bg-neutral-900 text-warning-500 text-2xl h-full flex items-center px-3">{t("kitchen:labels.avgTime", {time: avgTime})}</span>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-5">
          <ScrollContainer
            className={cn(
              'h-[calc(100vh_-_110px)] select-none overflow-y-hidden',
              dishesModal ? 'col-span-4' : 'col-span-5'
            )}
          >
            <div
              ref={boardAreaRef}
              className="flex flex-col flex-wrap gap-3 h-full content-start items-start"
              data-testid="kitchen-board"
            >
              {boardTickets.map((ticket) => {
                const ticketKey = `${ticket.batch.batchKey}_${ticket.chunkIndex}`;
                return (
                  <div key={ticketKey} className="w-[280px] max-h-full shrink-0">
                    <KitchenOrder
                      ticket={ticket}
                      kitchen={kitchen}
                      isNew={highlightedBatchKeys.has(ticket.batch.batchKey)}
                    />
                  </div>
                );
              })}
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

          {completedOrders.map((item) => {
            const completedAt = item.items?.[0]?.completed_at ?? item.items?.[0]?.created_at;

            return (
              <div key={item.batchKey} className="bg-white rounded-lg p-4 flex justify-between gap-4 items-center">
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
                  isLoading={recallingOrderKey === item.batchKey}
                  onClick={() => recallCompletedOrder(item)}
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
