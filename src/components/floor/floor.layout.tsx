import {useAtom} from "jotai";
import {appAlert, appPage, appSettings, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {CSSProperties, useCallback, useEffect, useMemo, useState} from "react";
import {Button} from "@/components/common/input/button.tsx";
import {cn} from "@/lib/utils.ts";
import {Tables} from "@/api/db/tables.ts";
import {Table} from "@/api/model/table.ts";
import {FloorTable} from "@/components/settings/floors/layout/table.tsx";
import {useDB} from "@/api/db/db.ts";
import {useDatabase} from "@/hooks/useDatabase.ts";
import {Order, OrderStatus} from "@/api/model/order.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faChair} from "@fortawesome/free-solid-svg-icons";
import {LiveSubscription} from "surrealdb";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {terminalSyncService} from "@/infrastructure/sync/sync-service.ts";
import {getClosingEnforcementState} from "@/lib/closing.guard.ts";
import {Link} from "react-router";
import {useTranslation} from "react-i18next";
import i18n from "@/lib/i18n.ts";
import {usePosOpenOrders} from "@/hooks/usePosOpenOrders.ts";
import {posStore} from "@/infrastructure/pos-store/pos-store.ts";
import {PosStoreError, type TableLockRecord} from "@/infrastructure/pos-store/types.ts";
import {getSyncStatus, subscribeSyncStatus} from "@/infrastructure/sync/sync-status.ts";


export const FloorLayout = () => {
  const { t } = useTranslation(['closing', 'common']);
  const [state, setState] = useAtom(appState);
  const [, setSettings] = useAtom(appSettings);
  const db = useDB();
  const { isEffectivelyConnected } = useDatabase();
  const [liveQuery, setLiveQuery] = useState<LiveSubscription | null>(null);
  const [tablesLiveQuery, setTablesLiveQuery] = useState<LiveSubscription | null>(null);
  const [page] = useAtom(appPage);
  const [, setAlert] = useAtom(appAlert);
  const [settings] = useAtom(appSettings);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const isClosingLocked = enforcement.orderTakingBlocked;
  const closingLockMessage = enforcement.message;
  const { orders: localOrders, terminalId, refresh: refreshOrders } = usePosOpenOrders();
  const [catalogFloors, setCatalogFloors] = useState<any[] | null>(null);
  const [catalogTables, setCatalogTables] = useState<any[] | null>(null);
  const [catalogHydrated, setCatalogHydrated] = useState(false);
  const [syncPhase, setSyncPhase] = useState(() => getSyncStatus().phase);

  const loadCatalog = useCallback(async () => {
    try {
      const cursor = await posStore.getSyncCursor();
      setCatalogHydrated(!!cursor.hydrated);
      const catalog = await posStore.loadHydratedCatalog();
      setCatalogFloors(Array.isArray(catalog.floors) ? catalog.floors : []);
      setCatalogTables(Array.isArray(catalog.tables) ? catalog.tables : []);
    } catch {
      // Keep last good snapshot; jotai fallback still available.
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => subscribeSyncStatus((s) => setSyncPhase(s.phase)), []);

  const floors = useMemo(() => {
    if (catalogFloors && catalogFloors.length > 0) return catalogFloors;
    if (catalogFloors && catalogHydrated) return catalogFloors;
    return settings.floors ?? [];
  }, [catalogFloors, catalogHydrated, settings.floors]);

  const allTables = useMemo(() => {
    if (catalogTables && catalogTables.length > 0) return catalogTables;
    if (catalogTables && catalogHydrated) return catalogTables;
    return settings.tables ?? [];
  }, [catalogTables, catalogHydrated, settings.tables]);

  const tables = useMemo(() => {
    if (state.floor) {
      const floorId = String(state.floor.id ?? '');
      return allTables.filter((item) => {
        const raw = item.floor;
        const itemFloorId =
          raw && typeof raw === 'object' && 'id' in raw
            ? String((raw as { id: unknown }).id ?? '')
            : String(raw ?? '');
        return itemFloorId === floorId;
      });
    }

    return allTables;
  }, [allTables, state.floor]);

  const catalogLoading =
    !catalogHydrated
    && (syncPhase === 'hydrating' || syncPhase === 'initializing' || syncPhase === 'syncing')
    && floors.length === 0;

  const categories = useMemo(() => {
    return settings.categories.filter(item => item.show_in_menu !== false);
  }, [settings.categories]);

  const orderTypes = useMemo(() => {
    return settings.order_types;
  }, [settings.order_types]);

  const paymentTypes = useMemo(() => {
    return settings.payment_types;
  }, [settings.payment_types]);

  // Open checks come from the PosStore (Dexie) — the same list online and
  // offline. Surreal `live(order)` below only wakes the sync so other terminals'
  // changes land in Dexie through pull; `usePosOpenOrders` re-reads on write.
  const floorOrders = useMemo<Order[]>(() => {
    return localOrders.filter((order) => String(order?.status) === OrderStatus['In Progress']) as unknown as Order[];
  }, [localOrders]);

  // Lock state lives in Dexie `tableLocks` (written locally, refreshed by pull).
  const fetchTables = async () => {
    const tableLocks: TableLockRecord[] = await posStore.getTableLocks().catch(() => [] as TableLockRecord[]);
    if (tableLocks.length === 0) {
      return;
    }
    const byId = new Map<string, TableLockRecord>(tableLocks.map((lock) => [String(lock.id), lock]));

    setSettings(prev => ({
      ...prev,
      tables: prev.tables.map((cachedTable) => {
        const lock = byId.get(String(cachedTable.id));
        if (!lock) {
          return cachedTable;
        }
        if (
          cachedTable.is_locked === lock.is_locked
          && String(cachedTable.locked_by ?? '') === String(lock.locked_by ?? '')
          && String(cachedTable.locked_at ?? '') === String(lock.locked_at ?? '')
        ) {
          return cachedTable;
        }
        return {
          ...cachedTable,
          is_locked: lock.is_locked,
          locked_at: lock.locked_at as any,
          locked_by: lock.locked_by ?? undefined,
        };
      })
    }));
  }

  const runLiveQuery = async () => {
    const result = await db.live(Tables.orders, function () {
      void terminalSyncService.synchronize().catch(() => undefined).then(refreshOrders);
    });

    setLiveQuery(result);
  }

  // Surreal live on floor_table is only a wake-up: another terminal's lock lands
  // in Dexie through sync pull, then the local read above refreshes the floor.
  const runTablesLiveQuery = async () => {
    const result = await db.live(Tables.tables, function () {
      void terminalSyncService.synchronize().catch(() => undefined).then(fetchTables);
    });

    setTablesLiveQuery(result);
  }

  useEffect(() => {
    void fetchTables();
    runLiveQuery().then();
    runTablesLiveQuery().then();

    return () => {
      liveQuery?.kill().catch(() => undefined);
      tablesLiveQuery?.kill().catch(() => undefined);
    }
  }, []);

  // Lock state changes (own writes + pulled rows) refresh the table chrome.
  useEffect(() => {
    const onLocalWrite = () => {
      void fetchTables();
    };
    window.addEventListener('posr-posstore-write', onLocalWrite);
    window.addEventListener('posr-operational-orders-updated', onLocalWrite);
    return () => {
      window.removeEventListener('posr-posstore-write', onLocalWrite);
      window.removeEventListener('posr-operational-orders-updated', onLocalWrite);
    };
  }, []);

  useEffect(() => {
    if (isClosingLocked && closingLockMessage) {
      setAlert(prev => ({
        ...prev,
        message: closingLockMessage,
        type: "warning",
        opened: true
      }));
    }
  }, [isClosingLocked, closingLockMessage, setAlert]);

  useEffect(() => {
    if (!state.floor && floors?.length > 0) {
      setState(prev => ({
        ...prev,
        floor: floors[0]
      }));
    }
  }, [floors, state.floor]);

  const tableOrders = (tableId: string) => {
    return floorOrders.filter((item) => {
      const tableRef = item?.table;
      const id =
        typeof tableRef === 'object' && tableRef != null && 'id' in tableRef
          ? String((tableRef as any).id)
          : String(tableRef ?? '');
      return id === tableId.toString();
    });
  }

  const tableOrder = (tableId: string) => {
    return floorOrders.find((item) => {
      const tableRef = item?.table;
      const id =
        typeof tableRef === 'object' && tableRef != null && 'id' in tableRef
          ? String((tableRef as any).id)
          : String(tableRef ?? '');
      return id === tableId.toString();
    });
  }

  const onClick = async (item: Table) => {
    // Local-first: use cached closing enforcement (provider refreshes when online;
    // offline falls back to PosStore settings inside getClosingEnforcementState).
    let enforcementState = enforcement;
    try {
      enforcementState = await getClosingEnforcementState(db);
    } catch (error) {
      console.warn("Closing enforcement live check failed; using cached state", error);
    }
    if (enforcementState.orderTakingBlocked) {
      setAlert(prev => ({
        ...prev,
        message: enforcementState.message ?? i18n.t('closing:orderTakingDisabled'),
        type: "warning",
        opened: true
      }));
      return;
    }

    if (item.is_locked) {
      setAlert(prev => ({
        ...prev,
        message: t('tableLocked', { user: item.locked_by }),
        type: 'error',
        opened: true
      }))
    }

    if (!item.is_block && !item.is_locked) {
      let ordersData = floorOrders;
      let ordersForTable = ordersData.filter(orderItem => {
        const tableRef = orderItem?.table;
        const tableId =
          typeof tableRef === 'object' && tableRef != null && 'id' in tableRef
            ? String((tableRef as any).id)
            : String(tableRef ?? '');
        return tableId === item.id.toString();
      });
      let order = ordersForTable[0];
      let cart = state.cart;

      if (order?.owner_terminal_id && terminalId && order.owner_terminal_id !== terminalId) {
        // Offline-only hard lock — online terminals may open any check.
        if (!isEffectivelyConnected) {
          setAlert(prev => ({
            ...prev,
            message: t('common:offline.ownedElsewhere', {
              defaultValue: 'Open on another terminal',
            }),
            type: 'error',
            opened: true,
          }));
          return;
        }
      }

      if (order?.id && terminalId) {
        try {
          await posStore.ensureLocalOrder({ order });
          if (!order.owner_terminal_id) {
            await posStore.claimOrder(String(order.id), { seed: { order } });
          }
        } catch (error) {
          if (error instanceof PosStoreError && error.code === 'NOT_OWNER') {
            setAlert(prev => ({
              ...prev,
              message: t('common:offline.ownedElsewhere'),
              type: 'error',
              opened: true,
            }));
            return;
          }
          console.warn('Failed to ensure local order before opening table', error);
        }
      }
      if (state.switchTable) {
        if (state.order.id !== 'new') {
          const fromTableId = state?.table?.id?.toString();
          const movingOrderId = String(state.order.id);
          const targetFloorId =
            item.floor && typeof item.floor === 'object' && 'id' in item.floor
              ? String((item.floor as { id: unknown }).id)
              : item.floor != null
                ? String(item.floor)
                : state.floor?.id != null
                  ? String(state.floor.id)
                  : null;
          // Move the check in Dexie; the outbox carries `table`/`floor` to Surreal.
          try {
            await posStore.mergeOrder(
              movingOrderId,
              { table: String(item.id), ...(targetFloorId ? { floor: targetFloorId } : {}) },
              { seed: { order: state.order.order, items: state.order.order?.items } },
            );
          } catch (error) {
            if (error instanceof PosStoreError && error.code === 'NOT_OWNER') {
              setAlert(prev => ({
                ...prev,
                message: t('common:offline.ownedElsewhere'),
                type: 'error',
                opened: true,
              }));
              return;
            }
            throw error;
          }

          // Read back from Dexie (hydrated) so the cart shows the moved order.
          const hydrated = await posStore.getOpenOrdersHydrated().catch(() => []);
          ordersForTable = hydrated.filter((orderItem: any) => {
            const tableRef = orderItem?.table;
            const tableId =
              typeof tableRef === 'object' && tableRef != null && 'id' in tableRef
                ? String((tableRef as any).id)
                : String(tableRef ?? '');
            return tableId === String(item.id);
          }) as unknown as Order[];
          order = ordersForTable.find(orderItem => orderItem?.id?.toString() === movingOrderId) ?? ordersForTable[0];

          if (!order && state.order.order) {
            order = {
              ...state.order.order,
              table: item
            };
            ordersForTable = [order];
          }

          postOrderTracking({
            module: "orders.move_table",
            page: page?.page,
            orderId: state.order.id,
            payload: {
              from_table: fromTableId,
              to_table: item.id.toString(),
            },
            user: page?.user,
          });
        }
        cart = [];
      }

      if (order) {
        cart = [];
      }

      const seats = new Map();
      order?.items.forEach(item => {
        if (item.seat) {
          seats.set(item.seat, item.seat);
        }
      });

      const seatsArray = Array.from(seats.values());

      const noSeat = state.cart.some(item => item.seat === undefined);

      const availableOrderTypes = item.order_types?.length > 0 ? item.order_types : orderTypes;
      const orderTypeId =
        order?.order_type && typeof order.order_type === 'object' && order.order_type != null && 'id' in order.order_type
          ? String((order.order_type as { id: unknown }).id)
          : order?.order_type != null
            ? String(order.order_type)
            : null;
      const orderTypeFromOrder = orderTypeId
        ? availableOrderTypes.find((ot) => String(ot.id) === orderTypeId)
          ?? (typeof order?.order_type === 'object' ? order.order_type : undefined)
        : undefined;

      setState(prev => ({
        ...prev,
        table: item,
        showFloor: false,
        showPersons: order ? false : item.ask_for_covers,
        persons: order ? order?.covers?.toString() : '1',
        orders: ordersForTable,
        cart: cart,
        seats: seatsArray,
        seat: noSeat ? undefined : (seatsArray.length > 0 ? seatsArray[0] : undefined),
        order: {
          order: order,
          id: order ? order.id : 'new'
        },
        switchTable: false, // turn off switch table flag
        customer: order?.customer, // clear customer
        orderType: orderTypeFromOrder ?? availableOrderTypes[0]
      }));

      setSettings(prev => ({
        ...prev,
        categories: item.categories?.length > 0 ? item.categories : categories,
        order_types: item.order_types?.length > 0 ? item.order_types : orderTypes,
        payment_types: item.payment_types?.length > 0 ? item.payment_types : paymentTypes,
      }));

      await posStore
        .lockTable(String(item.id), `${page.user.first_name} ${page.user.last_name}`)
        .catch((error) => console.warn('Failed to lock table', error));
    }
  }

  return (
    <>
      <div className="flex flex-col h-full min-h-0 transition-all delay-75" data-testid="menu-floor" style={{
        background: state.floor?.background
      }}>
        <div className="h-[80px] bg-white p-3 flex items-center">
          {state.switchTable && <div className="text-xl"><FontAwesomeIcon icon={faChair}/> {t('floor.switchTable', {
            table: `${state?.table?.name ?? ''}${state?.table?.number ?? ''}`
          })}</div>}
          {isClosingLocked && closingLockMessage && (
            <div className="alert alert-warning w-full">
              {closingLockMessage}
            </div>
          )}
        </div>
        <div className="layout relative flex-1 min-h-0 p-3 overflow-hidden" data-testid="menu-floor-tables">
          {catalogLoading && (
            <div className="flex items-center justify-center text-2xl text-neutral-500">
              {t('common:offline.syncing', { count: 0, defaultValue: 'Loading floors…' })}
            </div>
          )}
          {!catalogLoading && floors?.length === 0 && (
            <div className="flex items-center justify-center text-2xl">
              {t('floor.reloadCachePrefix')}{" "}<span className="ml-2 btn btn-secondary"><Link to="/settings">{t('floor.settings')}</Link></span>
            </div>
          )}
          {!catalogLoading && state.floor && (
            <>
              {tables?.map(item => (
                <FloorTable
                  order={tableOrder(item.id)}
                  table={item}
                  isEditing={false}
                  isLocked={item.is_locked}
                  onClick={() => onClick(item)}
                  key={item.id}
                  numberOfOrders={tableOrders(item.id)?.length}
                />
              ))}
            </>
          )}
        </div>
        <div className="floor-btns flex gap-3 p-3" data-testid="menu-floor-switcher">
          {floors?.map(item => (
            <Button
              variant="custom"
              key={item.id}
              size="lg"
              data-testid="menu-floor-btn"
              className={
                cn(
                  "flex-1 relative outline-none pressable",
                  state?.floor && item.id.toString() === state?.floor?.id?.toString() && 'bg-gradient'
                )
              }
              onClick={() => setState(prev => ({
                ...prev,
                floor: item
              }))}
              style={{
                '--background': item.background,
                '--color': item.color,
                '--scale': 0.98
              } as CSSProperties}
            >{item.name}</Button>
          ))}
        </div>
      </div>
    </>
  );
}
